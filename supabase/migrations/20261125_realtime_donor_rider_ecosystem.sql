-- ============================================================================
-- ShareBite: Complete Real-Time Donor & Rider Ecosystem Migration
-- Date: 2026-11-25
-- Additive & idempotent. Fixes global food discovery, atomic acceptance,
-- Donor+Rider notifications, status machine transitions, RLS & Realtime.
-- ============================================================================

-- ─── 1. Ensure Enum Extensions & Schema Columns ─────────────────────────────
do $$ begin alter type public.delivery_task_status add value if not exists 'arrived_at_pickup'; exception when others then null; end $$;
do $$ begin alter type public.notification_type add value if not exists 'new_message'; exception when others then null; end $$;
do $$ begin alter type public.notification_type add value if not exists 'rider_assigned'; exception when others then null; end $$;
do $$ begin alter type public.notification_type add value if not exists 'pickup_nearby'; exception when others then null; end $$;
do $$ begin alter type public.notification_type add value if not exists 'pickup_started'; exception when others then null; end $$;
do $$ begin alter type public.notification_type add value if not exists 'food_collected'; exception when others then null; end $$;
do $$ begin alter type public.notification_type add value if not exists 'delivery_completed'; exception when others then null; end $$;
do $$ begin alter type public.notification_type add value if not exists 'donation_cancelled'; exception when others then null; end $$;
do $$ begin alter type public.notification_type add value if not exists 'donation_reassigned'; exception when others then null; end $$;
do $$ begin alter type public.user_role add value if not exists 'rider'; exception when others then null; end $$;

alter table public.delivery_tasks
  add column if not exists arrived_at_pickup_at timestamptz,
  add column if not exists completed_at timestamptz;

alter table public.riders
  add column if not exists total_distance_km numeric(10,2) not null default 0;

-- ─── 2. Refresh Expired Deadlines on Active Unclaimed Available Listings ────
update public.food_listings
set
  available_until = now() + interval '24 hours',
  updated_at = now()
where status::text in ('available', 'partially_reserved')
  and available_servings > 0
  and assigned_rider_id is null
  and available_until <= now();

-- ─── 3. Global Unmasked Food Discovery RPC (get_nearby_food) ─────────────────
drop function if exists public.get_nearby_food(double precision, double precision, double precision);
create or replace function public.get_nearby_food(
  p_lat       double precision,
  p_lng       double precision,
  p_radius_km double precision default 50.0
)
returns table (
  id                 uuid,
  donor_id           uuid,
  title              text,
  description        text,
  category           text,
  food_type          text,
  servings           integer,
  available_servings integer,
  image_url          text,
  pickup_address     text,
  city               text,
  latitude           double precision,
  longitude          double precision,
  available_from     timestamptz,
  available_until    timestamptz,
  status             text,
  is_urgent          boolean,
  allergens          text[],
  storage_type       text,
  quantity_unit      text,
  distance_km        double precision
)
security definer
set search_path = public
language sql
stable as $$
  select
    fl.id,
    fl.donor_id,
    fl.title,
    fl.description,
    fl.category::text as category,
    fl.food_type::text as food_type,
    fl.servings,
    fl.available_servings,
    fl.image_url,
    coalesce(fl.pickup_address, fl.city, 'Donor Location') as pickup_address,
    fl.city,
    fl.latitude,
    fl.longitude,
    fl.available_from,
    fl.available_until,
    fl.status::text as status,
    fl.is_urgent,
    fl.allergens,
    fl.storage_type::text as storage_type,
    fl.quantity_unit::text as quantity_unit,
    case
      when p_lat is not null and p_lng is not null and fl.latitude is not null and fl.longitude is not null then
        round(
          (
            ST_Distance(
              coalesce(fl.location, ST_SetSRID(ST_MakePoint(fl.longitude, fl.latitude), 4326)::geography),
              ST_SetSRID(ST_MakePoint(p_lng, p_lat), 4326)::geography
            ) / 1000.0
          )::numeric,
          2
        )::double precision
      else null
    end as distance_km
  from public.food_listings fl
  where fl.status::text in ('available', 'partially_reserved')
    and fl.available_servings > 0
    and fl.assigned_rider_id is null
  order by
    case when fl.is_urgent then 0 else 1 end asc,
    distance_km asc nulls last,
    fl.created_at desc;
$$;

-- ─── 4. Atomic accept_donation RPC (First-Accept-Wins + Dual Notifications) ─
drop function if exists public.accept_donation(uuid, integer, timestamptz, text);
drop function if exists public.accept_donation(uuid, integer, timestamptz, text, text);

create or replace function public.accept_donation(
  p_food_listing_id   uuid,
  p_servings          integer default null,
  p_pickup_time       timestamptz default null,
  p_notes             text default null,
  p_collection_method text default 'ngo_delivery'
)
returns jsonb
security definer
set search_path = public
language plpgsql as $$
declare
  v_uid               uuid := auth.uid();
  v_profile           public.profiles%rowtype;
  v_food              public.food_listings%rowtype;
  v_rider             public.riders%rowtype;
  v_claim_id          uuid;
  v_res_id            uuid;
  v_task_id           uuid;
  v_conv_id           uuid;
  v_pickup_code       text;
  v_drop_code         text;
  v_servings          integer;
  v_est_km            numeric(8,2);
  v_collection_method text;
  v_ngo_row           record;
  v_rider_row         record;
  v_matched_ngo       record;
  v_has_matched_ngo   boolean := false;
begin
  if v_uid is null then
    raise exception 'Authentication required';
  end if;

  select * into v_profile from public.profiles where id = v_uid;
  if not found then
    raise exception 'User profile not found';
  end if;

  -- Lock listing row atomically so only one rider/NGO can win
  select * into v_food
  from public.food_listings
  where id = p_food_listing_id
  for update;

  if not found then
    raise exception 'Food donation not found';
  end if;

  if v_food.donor_id = v_uid then
    raise exception 'Donors cannot accept their own food donation';
  end if;

  if v_food.status::text not in ('available', 'partially_reserved') or v_food.available_servings <= 0 or v_food.assigned_rider_id is not null then
    raise exception 'ALREADY_CLAIMED: This donation has already been claimed by another user.';
  end if;

  v_servings := coalesce(p_servings, v_food.available_servings);
  if v_servings <= 0 or v_servings > v_food.available_servings then
    raise exception 'Requested % servings but only % available', v_servings, v_food.available_servings;
  end if;

  v_pickup_code := upper(substring(encode(gen_random_bytes(3), 'hex'), 1, 6));
  v_drop_code   := upper(substring(encode(gen_random_bytes(3), 'hex'), 1, 6));
  v_collection_method := case
    when p_collection_method = 'direct_ngo_pickup' then 'direct_ngo_pickup'
    else 'ngo_delivery'
  end;

  -- ── BRANCH A: Verified NGO / Acceptor ──────────────────────────────────────
  if v_profile.role::text in ('ngo', 'receiver', 'acceptor') then
    if not coalesce(v_profile.is_verified, false) then
      raise exception 'Only verified NGOs can claim food donations. Please complete NGO verification.';
    end if;

    if exists (
      select 1 from public.ngo_claims
      where food_listing_id = p_food_listing_id
        and ngo_id = v_uid
        and status not in ('cancelled', 'expired')
    ) then
      raise exception 'ALREADY_CLAIMED: Your organization has already claimed this donation.';
    end if;

    insert into public.reservations (food_listing_id, user_id, servings, status, pickup_time, notes)
    values (p_food_listing_id, v_uid, v_servings, 'confirmed', p_pickup_time, p_notes)
    returning id into v_res_id;

    insert into public.ngo_claims (
      food_listing_id, ngo_id, reservation_id, servings_claimed,
      status, collection_method, pickup_code, pickup_time, notes, ngo_name, confirmed_at
    )
    values (
      p_food_listing_id, v_uid, v_res_id, v_servings,
      case when v_collection_method = 'direct_ngo_pickup' then 'confirmed'::public.claim_status else 'awaiting_rider'::public.claim_status end,
      v_collection_method, v_pickup_code, p_pickup_time, p_notes,
      coalesce(v_profile.organization_name, v_profile.full_name, 'Verified NGO'), now()
    )
    returning id into v_claim_id;

    update public.food_listings
    set
      available_servings = available_servings - v_servings,
      status = case
        when available_servings - v_servings = 0 then 'reserved'::public.food_status
        else 'partially_reserved'::public.food_status
      end,
      accepted_by_role = 'ngo',
      updated_at = now()
    where id = p_food_listing_id;

    if v_collection_method = 'ngo_delivery' then
      v_est_km := case
        when v_food.latitude is not null and v_food.longitude is not null
             and v_profile.latitude is not null and v_profile.longitude is not null
        then round(public.calculate_distance_km(v_food.latitude, v_food.longitude, v_profile.latitude, v_profile.longitude)::numeric, 2)
        else null
      end;

      insert into public.delivery_tasks (
        food_listing_id, claim_id, reservation_id,
        donor_id, ngo_id, assignment_type,
        pickup_address, pickup_lat, pickup_lng,
        dropoff_address, dropoff_lat, dropoff_lng,
        food_title, servings_required, quantity_unit,
        pickup_window_start, pickup_window_end, collection_deadline,
        instructions, estimated_km, status, pickup_code, dropoff_code
      )
      values (
        p_food_listing_id, v_claim_id, v_res_id,
        v_food.donor_id, v_uid, 'ngo_delivery',
        v_food.pickup_address, v_food.latitude, v_food.longitude,
        coalesce(v_profile.address, v_profile.city), v_profile.latitude, v_profile.longitude,
        v_food.title, v_servings, coalesce(v_food.quantity_unit, 'servings'),
        p_pickup_time, v_food.available_until, v_food.available_until,
        coalesce(p_notes, v_food.description), v_est_km, 'awaiting_rider', v_pickup_code, v_drop_code
      )
      returning id into v_task_id;
    else
      v_task_id := null;
    end if;

    insert into public.impact_events (user_id, reservation_id, event_type, servings)
    values (v_uid, v_res_id, 'food_reserved', v_servings);

    insert into public.donation_status_history (
      food_listing_id, delivery_task_id, claim_id, previous_status, new_status, changed_by, actor_role, notes
    ) values (
      p_food_listing_id, v_task_id, v_claim_id, v_food.status::text, 'CLAIMED', v_uid, 'ngo',
      'Accepted by NGO ' || coalesce(v_profile.organization_name, v_profile.full_name)
    );

    insert into public.notifications (user_id, type, title, message, data, related_food_id, related_claim_id, related_delivery_id, action_url)
    values (
      v_food.donor_id,
      'donation_claimed',
      case when v_collection_method = 'direct_ngo_pickup' then 'NGO Accepted Your Donation (Direct Pickup)!' else 'NGO Accepted Your Donation!' end,
      coalesce(v_profile.organization_name, v_profile.full_name, 'An NGO') || ' accepted "' || v_food.title || '".',
      jsonb_build_object('food_listing_id', p_food_listing_id, 'claim_id', v_claim_id, 'delivery_task_id', v_task_id, 'collection_method', v_collection_method),
      p_food_listing_id, v_claim_id, v_task_id, '/donor-dashboard'
    );

    if v_collection_method = 'ngo_delivery' and v_task_id is not null and v_food.latitude is not null and v_food.longitude is not null then
      for v_rider_row in
        select * from public.find_nearby_riders(v_food.latitude, v_food.longitude, coalesce(v_food.notification_radius_km, 15.0))
        where user_id <> v_food.donor_id
      loop
        insert into public.notifications (user_id, type, title, message, data, related_food_id, related_delivery_id, action_url)
        values (
          v_rider_row.user_id,
          'pickup_nearby',
          'NEW DELIVERY JOB AVAILABLE!',
          'Pickup "' || v_food.title || '" (' || v_servings || ' servings) • ' || v_rider_row.distance_km || ' km away',
          jsonb_build_object('opportunity_type', 'delivery_task', 'delivery_task_id', v_task_id, 'food_listing_id', p_food_listing_id, 'title', v_food.title, 'servings', v_servings, 'distance_km', v_rider_row.distance_km),
          p_food_listing_id, v_task_id, '/rider-dashboard'
        );
      end loop;
    end if;

    return jsonb_build_object(
      'accepted_by', 'ngo',
      'collection_method', v_collection_method,
      'claim_id', v_claim_id,
      'delivery_task_id', v_task_id,
      'pickup_code', v_pickup_code,
      'status', case when v_collection_method = 'direct_ngo_pickup' then 'confirmed' else 'awaiting_rider' end
    );

  -- ── BRANCH B: Rider Accepts Pickup (Atomic First-Accept-Wins) ──────────────
  elsif v_profile.role::text in ('rider', 'volunteer') then
    insert into public.riders (user_id, name, phone, is_online, is_available, id_verified)
    values (
      v_uid,
      coalesce(v_profile.full_name, 'ShareBite Rider'),
      coalesce(v_profile.phone, ''),
      true,
      true,
      coalesce(v_profile.is_verified, false)
    )
    on conflict (user_id) do nothing;

    select * into v_rider from public.riders where user_id = v_uid for update;
    if not found then
      raise exception 'Rider profile not found';
    end if;

    if not coalesce(v_rider.is_available, true) then
      raise exception 'You already have an active delivery assignment. Complete it before accepting another.';
    end if;

    if exists (
      select 1 from public.ngo_claims
      where food_listing_id = p_food_listing_id
        and status not in ('cancelled', 'expired')
    ) then
      raise exception 'ALREADY_CLAIMED: An NGO has already claimed this donation. Accept the delivery job from Available Pickups instead.';
    end if;

    if v_food.latitude is not null and v_food.longitude is not null then
      select * into v_matched_ngo
      from public.find_nearby_ngos(
        v_food.latitude,
        v_food.longitude,
        coalesce(v_food.notification_radius_km, 25.0),
        true
      )
      where id <> v_food.donor_id
      limit 1;

      if found then
        v_has_matched_ngo := true;
      end if;
    end if;

    if v_has_matched_ngo then
      v_est_km := round(public.calculate_distance_km(v_food.latitude, v_food.longitude, v_matched_ngo.latitude, v_matched_ngo.longitude)::numeric, 2);

      insert into public.reservations (food_listing_id, user_id, servings, status, pickup_time, notes)
      values (p_food_listing_id, v_matched_ngo.id, v_food.available_servings, 'confirmed', p_pickup_time, p_notes)
      returning id into v_res_id;

      insert into public.ngo_claims (
        food_listing_id, ngo_id, reservation_id, servings_claimed,
        status, collection_method, pickup_code, pickup_time, notes, ngo_name,
        confirmed_at, rider_assigned_at
      )
      values (
        p_food_listing_id, v_matched_ngo.id, v_res_id, v_food.available_servings,
        'rider_assigned', 'ngo_delivery', v_pickup_code, p_pickup_time, p_notes,
        coalesce(v_matched_ngo.organization_name, v_matched_ngo.full_name, 'Verified NGO'),
        now(), now()
      )
      returning id into v_claim_id;

      insert into public.delivery_tasks (
        food_listing_id, claim_id, reservation_id,
        rider_id, donor_id, ngo_id, assignment_type,
        pickup_address, pickup_lat, pickup_lng,
        dropoff_address, dropoff_lat, dropoff_lng,
        food_title, servings_required, quantity_unit,
        collection_deadline, instructions, estimated_km, status, pickup_code, dropoff_code, rider_assigned_at
      )
      values (
        p_food_listing_id, v_claim_id, v_res_id,
        v_rider.id, v_food.donor_id, v_matched_ngo.id, 'ngo_delivery',
        v_food.pickup_address, v_food.latitude, v_food.longitude,
        coalesce(v_matched_ngo.address, v_matched_ngo.city, 'Partner NGO'),
        v_matched_ngo.latitude, v_matched_ngo.longitude,
        v_food.title, v_food.available_servings, coalesce(v_food.quantity_unit, 'servings'),
        v_food.available_until, coalesce(p_notes, v_food.description), v_est_km,
        'rider_assigned', v_pickup_code, v_drop_code, now()
      )
      returning id into v_task_id;
    else
      v_claim_id := null;
      v_est_km := case
        when v_food.latitude is not null and v_food.longitude is not null
             and v_rider.current_lat is not null and v_rider.current_lng is not null
        then round(public.calculate_distance_km(v_rider.current_lat, v_rider.current_lng, v_food.latitude, v_food.longitude)::numeric, 2)
        else null
      end;

      insert into public.delivery_tasks (
        food_listing_id, rider_id, donor_id, ngo_id, assignment_type,
        pickup_address, pickup_lat, pickup_lng,
        dropoff_address, food_title, servings_required, quantity_unit,
        collection_deadline, instructions, estimated_km, status, pickup_code, dropoff_code, rider_assigned_at
      )
      values (
        p_food_listing_id, v_rider.id, v_food.donor_id, null, 'rider_direct_pickup',
        v_food.pickup_address, v_food.latitude, v_food.longitude,
        'Community Distribution / Partner Shelter', v_food.title, v_food.available_servings, coalesce(v_food.quantity_unit, 'servings'),
        v_food.available_until, coalesce(p_notes, v_food.description), v_est_km,
        'rider_assigned', v_pickup_code, v_drop_code, now()
      )
      returning id into v_task_id;
    end if;

    update public.food_listings
    set
      available_servings = 0,
      status = 'reserved'::public.food_status,
      assigned_rider_id = v_rider.id,
      accepted_by_role = 'rider',
      updated_at = now()
    where id = p_food_listing_id;

    update public.riders
    set is_available = false, is_online = true, updated_at = now()
    where id = v_rider.id;

    -- Atomically create Donor <-> Rider conversation channel
    insert into public.conversations (type, related_listing_id, related_task_id, title, last_message_at)
    values ('delivery', p_food_listing_id, v_task_id, v_food.title, now())
    returning id into v_conv_id;

    insert into public.conversation_participants (conversation_id, user_id, role)
    values
      (v_conv_id, v_food.donor_id, 'donor'),
      (v_conv_id, v_uid, 'rider')
    on conflict (conversation_id, user_id) do nothing;

    insert into public.messages (conversation_id, sender_id, content, message_type)
    values (
      v_conv_id,
      v_uid,
      'Rider ' || coalesce(nullif(v_rider.name, ''), v_profile.full_name, 'Partner') || ' accepted your food pickup "' || v_food.title || '".',
      'system'
    );

    insert into public.donation_status_history (
      food_listing_id, delivery_task_id, claim_id, previous_status, new_status, changed_by, actor_role, notes
    ) values (
      p_food_listing_id, v_task_id, v_claim_id, v_food.status::text, 'ACCEPTED', v_uid, 'rider',
      'Accepted by rider ' || coalesce(nullif(v_rider.name, ''), v_profile.full_name)
    );

    -- Notify Donor
    insert into public.notifications (user_id, type, title, message, data, related_food_id, related_claim_id, related_delivery_id, action_url)
    values (
      v_food.donor_id,
      'rider_assigned',
      'Rider Accepted Your Donation!',
      coalesce(nullif(v_rider.name, ''), v_profile.full_name, 'A ShareBite rider') || ' accepted "' || v_food.title || '" and is preparing to head to your location.',
      jsonb_build_object(
        'food_listing_id', p_food_listing_id,
        'delivery_task_id', v_task_id,
        'rider_id', v_rider.id,
        'conversation_id', v_conv_id
      ),
      p_food_listing_id, v_claim_id, v_task_id, '/donor-donations'
    );

    -- Notify Rider with acceptance confirmation
    insert into public.notifications (user_id, type, title, message, data, related_food_id, related_claim_id, related_delivery_id, action_url)
    values (
      v_uid,
      'rider_assigned',
      'Donation Acceptance Confirmed!',
      'You accepted "' || v_food.title || '" at ' || coalesce(v_food.pickup_address, v_food.city, 'donor location') || '. Open directions or chat with the donor.',
      jsonb_build_object(
        'food_listing_id', p_food_listing_id,
        'delivery_task_id', v_task_id,
        'conversation_id', v_conv_id
      ),
      p_food_listing_id, v_claim_id, v_task_id, '/rider/deliveries?tab=active'
    );

    if v_has_matched_ngo then
      insert into public.notifications (user_id, type, title, message, data, related_food_id, related_claim_id, related_delivery_id, action_url)
      values (
        v_matched_ngo.id,
        'rider_assigned',
        'Incoming Delivery Assigned to Your NGO!',
        coalesce(nullif(v_rider.name, ''), v_profile.full_name, 'A rider') || ' accepted "' || v_food.title || '" and will deliver it to your NGO.',
        jsonb_build_object('food_listing_id', p_food_listing_id, 'delivery_task_id', v_task_id, 'claim_id', v_claim_id),
        p_food_listing_id, v_claim_id, v_task_id, '/my-claims'
      );
    end if;

    return jsonb_build_object(
      'accepted_by', 'rider',
      'claim_id', v_claim_id,
      'delivery_task_id', v_task_id,
      'conversation_id', v_conv_id,
      'pickup_lat', v_food.latitude,
      'pickup_lng', v_food.longitude,
      'pickup_address', v_food.pickup_address,
      'status', 'rider_assigned',
      'rider_notified', true
    );
  else
    raise exception 'Only verified NGOs or riders can accept food donations';
  end if;
end;
$$;

-- ─── 5. Ensure arrived_at_pickup is Handled in Location, Cancel & Reassign ───
drop function if exists public.update_rider_location(double precision, double precision, double precision, double precision, double precision, uuid);
create or replace function public.update_rider_location(
  p_lat              double precision,
  p_lng              double precision,
  p_accuracy_m       double precision default null,
  p_heading          double precision default null,
  p_speed            double precision default null,
  p_delivery_task_id uuid default null
)
returns boolean
security definer
set search_path = public
language plpgsql as $$
declare
  v_uid   uuid := auth.uid();
  v_rider public.riders%rowtype;
  v_task  public.delivery_tasks%rowtype;
begin
  if v_uid is null then raise exception 'Authentication required'; end if;
  if p_lat is null or p_lng is null or p_lat < -90 or p_lat > 90 or p_lng < -180 or p_lng > 180 then
    raise exception 'Invalid GPS coordinates';
  end if;

  select * into v_rider from public.riders where user_id = v_uid;
  if not found then raise exception 'Rider record not found'; end if;

  update public.riders
  set current_lat = p_lat, current_lng = p_lng, location_accuracy_m = p_accuracy_m, last_location_at = now(), updated_at = now()
  where id = v_rider.id;

  if p_delivery_task_id is not null then
    select * into v_task from public.delivery_tasks where id = p_delivery_task_id;
    if found and v_task.rider_id = v_rider.id
       and v_task.status::text in ('rider_assigned', 'going_to_pickup', 'arrived_at_pickup', 'food_collected', 'in_transit') then
      insert into public.rider_location_updates (rider_id, delivery_task_id, latitude, longitude, heading, speed, accuracy_m)
      values (v_rider.id, p_delivery_task_id, p_lat, p_lng, p_heading, p_speed, p_accuracy_m);
    end if;
  end if;

  return true;
end;
$$;

drop function if exists public.cancel_donation(uuid, text);
create or replace function public.cancel_donation(
  p_food_listing_id uuid,
  p_reason          text default null
)
returns boolean
security definer
set search_path = public
language plpgsql as $$
declare
  v_uid   uuid := auth.uid();
  v_food  public.food_listings%rowtype;
  v_task  record;
begin
  if v_uid is null then raise exception 'Authentication required'; end if;

  select * into v_food from public.food_listings where id = p_food_listing_id for update;
  if not found then raise exception 'Food listing not found'; end if;

  if v_food.donor_id <> v_uid and coalesce(public.get_auth_user_role(), '') <> 'admin' then
    raise exception 'Only the donor can cancel this listing';
  end if;

  if exists (
    select 1 from public.delivery_tasks
    where food_listing_id = p_food_listing_id
      and status::text in ('food_collected', 'in_transit', 'delivered', 'completed')
  ) then
    raise exception 'Cannot cancel listing after food has been collected or delivered';
  end if;

  for v_task in
    select * from public.delivery_tasks
    where food_listing_id = p_food_listing_id
      and status::text in ('awaiting_rider', 'rider_assigned', 'going_to_pickup', 'arrived_at_pickup')
    for update
  loop
    if v_task.rider_id is not null then
      update public.riders set is_available = true, updated_at = now() where id = v_task.rider_id;
      insert into public.notifications (user_id, type, title, message, related_food_id, action_url)
      select r.user_id, 'donation_cancelled', 'Donation Cancelled',
        'Donation "' || v_food.title || '" was cancelled by the donor.', p_food_listing_id, '/rider-dashboard'
      from public.riders r where r.id = v_task.rider_id;
    end if;

    if v_task.ngo_id is not null then
      insert into public.notifications (user_id, type, title, message, related_food_id, action_url)
      values (v_task.ngo_id, 'donation_cancelled', 'Donation Cancelled',
        'Donation "' || v_food.title || '" was cancelled by the donor.', p_food_listing_id, '/my-claims');
    end if;

    update public.delivery_tasks set status = 'cancelled', updated_at = now() where id = v_task.id;
  end loop;

  update public.ngo_claims
  set status = 'cancelled', cancellation_reason = coalesce(p_reason, 'Cancelled by donor'), updated_at = now()
  where food_listing_id = p_food_listing_id and status not in ('cancelled', 'expired', 'delivered', 'distributed');

  update public.food_listings
  set status = 'cancelled', updated_at = now()
  where id = p_food_listing_id;

  insert into public.donation_status_history (
    food_listing_id, previous_status, new_status, changed_by, actor_role, notes
  ) values (
    p_food_listing_id, v_food.status::text, 'CANCELLED', v_uid, 'donor', p_reason
  );

  return true;
end;
$$;

drop function if exists public.reassign_donation(uuid, text);
create or replace function public.reassign_donation(
  p_task_id uuid,
  p_reason  text default null
)
returns boolean
security definer
set search_path = public
language plpgsql as $$
declare
  v_uid   uuid := auth.uid();
  v_task  public.delivery_tasks%rowtype;
  v_rider public.riders%rowtype;
  v_food  public.food_listings%rowtype;
begin
  if v_uid is null then raise exception 'Authentication required'; end if;

  select * into v_task from public.delivery_tasks where id = p_task_id for update;
  if not found then raise exception 'Delivery task not found'; end if;

  select * into v_rider from public.riders where user_id = v_uid;

  if not (
    public.get_auth_user_role() = 'admin'
    or (v_rider.id is not null and v_task.rider_id = v_rider.id)
    or v_task.ngo_id = v_uid
  ) then
    raise exception 'Not authorised to reassign this task';
  end if;

  if v_task.status::text not in ('rider_assigned', 'going_to_pickup', 'arrived_at_pickup') then
    raise exception 'Cannot reassign task after food has been collected (status: %)', v_task.status;
  end if;

  if v_task.rider_id is not null then
    update public.riders set is_available = true, updated_at = now() where id = v_task.rider_id;
  end if;

  select * into v_food from public.food_listings where id = v_task.food_listing_id for update;

  if v_task.assignment_type = 'rider_direct_pickup' or v_task.ngo_id is null then
    update public.delivery_tasks set status = 'cancelled', updated_at = now() where id = p_task_id;
    update public.food_listings
    set status = 'available', available_servings = v_food.servings, assigned_rider_id = null, accepted_by_role = null, updated_at = now()
    where id = v_task.food_listing_id;
  else
    update public.delivery_tasks
    set rider_id = null, status = 'awaiting_rider', rider_assigned_at = null, updated_at = now()
    where id = p_task_id;

    update public.food_listings set assigned_rider_id = null, updated_at = now() where id = v_task.food_listing_id;

    if v_task.claim_id is not null then
      update public.ngo_claims set status = 'awaiting_rider', rider_assigned_at = null, updated_at = now() where id = v_task.claim_id;
    end if;
  end if;

  insert into public.donation_status_history (
    food_listing_id, delivery_task_id, claim_id, previous_status, new_status, changed_by, actor_role, notes
  ) values (
    v_task.food_listing_id, p_task_id, v_task.claim_id, v_task.status::text, 'AVAILABLE', v_uid,
    coalesce(public.get_auth_user_role(), 'rider'), coalesce(p_reason, 'Rider released assignment before pickup')
  );

  insert into public.notifications (user_id, type, title, message, related_food_id, action_url)
  values (
    v_task.donor_id, 'donation_reassigned', 'Reassigning Pickup Rider',
    'Previous rider released "' || coalesce(v_task.food_title, 'donation') || '". Available again for nearby riders.',
    v_task.food_listing_id, '/donor-dashboard'
  );

  return true;
end;
$$;

-- ─── 6. Ensure switch_user_role RPC Exists & Safe RLS Policies Hold ──────────
create or replace function public.prevent_profile_privilege_escalation()
returns trigger
security definer
set search_path = public
language plpgsql as $$
begin
  if coalesce(current_setting('sharebite.allow_role_switch', true), 'false') = 'true' then
    return new;
  end if;

  if auth.uid() is not null
     and coalesce(current_setting('request.jwt.claim.role', true), '') <> 'service_role'
     and coalesce(public.get_auth_user_role(), '') <> 'admin'
  then
    if new.role is distinct from old.role then
      raise exception 'Permission denied: users cannot modify their own role directly'
        using errcode = '42501';
    end if;

    if new.is_verified is distinct from old.is_verified
       or new.verification_status is distinct from old.verification_status then
      raise exception 'Permission denied: only administrators can modify verification status'
        using errcode = '42501';
    end if;
  end if;

  return new;
end;
$$;

create or replace function public.switch_user_role(p_target_role text)
returns jsonb
security definer
set search_path = public
language plpgsql as $$
declare
  v_uid         uuid := auth.uid();
  v_target_role text := lower(trim(coalesce(p_target_role, '')));
  v_safe_role   public.user_role;
  v_prof        public.profiles%rowtype;
begin
  if v_uid is null then
    raise exception 'Authentication required to switch role';
  end if;

  if v_target_role not in ('donor', 'rider', 'ngo', 'volunteer', 'community', 'acceptor') then
    raise exception 'Invalid role "%" requested', p_target_role;
  end if;

  if v_target_role = 'acceptor' then
    v_target_role := 'ngo';
  end if;

  v_safe_role := v_target_role::public.user_role;

  perform set_config('sharebite.allow_role_switch', 'true', true);

  update public.profiles
  set role = v_safe_role,
      updated_at = now()
  where id = v_uid
  returning * into v_prof;

  if not found then
    raise exception 'User profile not found';
  end if;

  if v_safe_role in ('rider', 'volunteer') then
    insert into public.riders (user_id, name, phone, is_online, is_available, id_verified)
    values (
      v_uid,
      coalesce(v_prof.full_name, 'Rider'),
      coalesce(v_prof.phone, ''),
      false,
      true,
      false
    )
    on conflict (user_id) do update
      set name = coalesce(excluded.name, riders.name),
          phone = coalesce(excluded.phone, riders.phone),
          updated_at = now();
  end if;

  return to_jsonb(v_prof);
end;
$$;

-- ─── 7. Food Listings & Notifications RLS + Realtime Publication Guarantee ──
alter table public.food_listings enable row level security;

drop policy if exists "food_select_authenticated" on public.food_listings;
create policy "food_select_authenticated" on public.food_listings
  for select to authenticated using (true);

drop policy if exists "food_insert_own" on public.food_listings;
create policy "food_insert_own" on public.food_listings
  for insert to authenticated with check (donor_id = auth.uid());

drop policy if exists "food_update_own" on public.food_listings;
create policy "food_update_own" on public.food_listings
  for update to authenticated
  using (donor_id = auth.uid() or public.get_auth_user_role() = 'admin')
  with check (donor_id = auth.uid() or public.get_auth_user_role() = 'admin');

drop policy if exists "food_delete_own" on public.food_listings;
create policy "food_delete_own" on public.food_listings
  for delete to authenticated using (donor_id = auth.uid() or public.get_auth_user_role() = 'admin');

-- Ensure Realtime covers every core ecosystem table idempotently
do $$ begin alter publication supabase_realtime add table public.food_listings; exception when others then null; end $$;
do $$ begin alter publication supabase_realtime add table public.delivery_tasks; exception when others then null; end $$;
do $$ begin alter publication supabase_realtime add table public.ngo_claims; exception when others then null; end $$;
do $$ begin alter publication supabase_realtime add table public.conversations; exception when others then null; end $$;
do $$ begin alter publication supabase_realtime add table public.conversation_participants; exception when others then null; end $$;
do $$ begin alter publication supabase_realtime add table public.messages; exception when others then null; end $$;
do $$ begin alter publication supabase_realtime add table public.notifications; exception when others then null; end $$;
do $$ begin alter publication supabase_realtime add table public.donation_status_history; exception when others then null; end $$;
do $$ begin alter publication supabase_realtime add table public.rider_location_updates; exception when others then null; end $$;

grant execute on function public.get_nearby_food(double precision, double precision, double precision) to anon, authenticated;
grant execute on function public.accept_donation(uuid, integer, timestamptz, text, text) to authenticated;
grant execute on function public.update_rider_location(double precision, double precision, double precision, double precision, double precision, uuid) to authenticated;
grant execute on function public.cancel_donation(uuid, text) to authenticated;
grant execute on function public.reassign_donation(uuid, text) to authenticated;
grant execute on function public.switch_user_role(text) to authenticated;

-- ============================================================================
-- DONE ✓ ShareBite Real-Time Donor & Rider Ecosystem Migration Ready
-- ============================================================================
