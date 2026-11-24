-- ==============================================================================
-- ShareBite Production Migration: Complete Rider Delivery Lifecycle Fix
-- Fixes:
-- 1. Helpers: calculate_distance_km & get_auth_user_role (100% self-contained)
-- 2. accept_donation RPC: Pure MD5 codes (no gen_random_bytes), dynamic active-task check
-- 3. update_donation_status RPC: Multi-role authorization, full direct lifecycle (collected -> completed)
-- 4. confirm_pickup RPC: Pure MD5 code verification gate with donor-rider coordination
-- 5. RLS & Realtime publication guarantees
-- ==============================================================================

-- ─── 0. Prerequisite Helpers ──────────────────────────────────────────────────
create or replace function public.calculate_distance_km(
  lat1 double precision,
  lon1 double precision,
  lat2 double precision,
  lon2 double precision
)
returns double precision
language sql
immutable
as $$
  select 6371.0 * acos(
    least(1.0, greatest(-1.0,
      cos(radians(lat1)) * cos(radians(lat2)) * cos(radians(lon2) - radians(lon1)) +
      sin(radians(lat1)) * sin(radians(lat2))
    ))
  );
$$;

create or replace function public.get_auth_user_role()
returns text
security definer
set search_path = public
language plpgsql
stable as $$
declare
  v_role text;
begin
  select role::text into v_role
  from public.profiles
  where id = auth.uid();
  return coalesce(v_role, 'donor');
end;
$$;

grant execute on function public.calculate_distance_km(double precision, double precision, double precision, double precision) to authenticated;
grant execute on function public.get_auth_user_role() to authenticated;

-- ─── 1. accept_donation RPC (Pure MD5 & Non-blocking availability) ───────────
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
set search_path = public, extensions
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

  if v_food.donor_id = v_uid and v_profile.role::text not in ('rider', 'volunteer') then
    raise exception 'Donors cannot accept their own food donation';
  end if;

  if v_food.status::text not in ('available', 'partially_reserved') or v_food.available_servings <= 0 or v_food.assigned_rider_id is not null then
    raise exception 'ALREADY_CLAIMED: This donation has already been claimed by another user.';
  end if;

  v_servings := coalesce(p_servings, v_food.available_servings);
  if v_servings <= 0 or v_servings > v_food.available_servings then
    raise exception 'Requested % servings but only % available', v_servings, v_food.available_servings;
  end if;

  -- Pure MD5 6-character random verification codes (100% Postgres compatible, no pgcrypto dependency)
  v_pickup_code := upper(substring(md5(random()::text || clock_timestamp()::text || p_food_listing_id::text), 1, 6));
  v_drop_code   := upper(substring(md5(random()::text || clock_timestamp()::text || v_uid::text), 1, 6));
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
        collection_deadline, instructions, estimated_km, status, pickup_code, dropoff_code
      )
      values (
        p_food_listing_id, v_claim_id, v_res_id,
        v_food.donor_id, v_uid, 'ngo_delivery',
        v_food.pickup_address, v_food.latitude, v_food.longitude,
        coalesce(v_profile.address, v_profile.city, 'NGO Facility'),
        v_profile.latitude, v_profile.longitude,
        v_food.title, v_servings, coalesce(v_food.quantity_unit, 'servings'),
        v_food.available_until, coalesce(p_notes, v_food.description), v_est_km,
        'awaiting_rider', v_pickup_code, v_drop_code
      )
      returning id into v_task_id;
    end if;

    -- Atomically create Donor <-> NGO conversation channel
    insert into public.conversations (type, related_listing_id, related_claim_id, title, last_message_at)
    values ('donation', p_food_listing_id, v_claim_id, v_food.title, now())
    returning id into v_conv_id;

    insert into public.conversation_participants (conversation_id, user_id, role)
    values
      (v_conv_id, v_food.donor_id, 'donor'),
      (v_conv_id, v_uid, 'ngo')
    on conflict (conversation_id, user_id) do nothing;

    insert into public.messages (conversation_id, sender_id, content, message_type)
    values (
      v_conv_id,
      v_uid,
      coalesce(v_profile.organization_name, v_profile.full_name, 'An NGO') || ' accepted your food donation "' || v_food.title || '".',
      'system'
    );

    insert into public.donation_status_history (
      food_listing_id, claim_id, delivery_task_id, previous_status, new_status, changed_by, actor_role, notes
    ) values (
      p_food_listing_id, v_claim_id, v_task_id, v_food.status::text, 'ACCEPTED', v_uid, 'ngo',
      'Claimed by ' || coalesce(v_profile.organization_name, v_profile.full_name, 'NGO')
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
    on conflict (user_id) do update set
      is_online = true,
      updated_at = now();

    select * into v_rider from public.riders where user_id = v_uid for update;
    if not found then
      raise exception 'Rider profile could not be established';
    end if;

    -- Dynamic check: only lock out if an ongoing non-terminal delivery actually exists
    if exists (
      select 1 from public.delivery_tasks
      where rider_id = v_rider.id
        and status in ('rider_assigned', 'going_to_pickup', 'arrived_at_pickup', 'food_collected', 'in_transit')
    ) then
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
      'Rider Accepted Your Pickup!',
      'Rider ' || coalesce(nullif(v_rider.name, ''), v_profile.full_name, 'ShareBite Rider') || ' has accepted "' || v_food.title || '" and is coming to pick up your order.',
      jsonb_build_object('food_listing_id', p_food_listing_id, 'delivery_task_id', v_task_id, 'rider_id', v_rider.id, 'conversation_id', v_conv_id),
      p_food_listing_id, v_claim_id, v_task_id, '/donor-dashboard'
    );

    -- Notify Rider
    insert into public.notifications (user_id, type, title, message, data, related_food_id, related_claim_id, related_delivery_id, action_url)
    values (
      v_uid,
      'rider_assigned',
      'Donation Acceptance Confirmed!',
      'Order Accepted! You locked pickup for "' || v_food.title || '" at ' || coalesce(v_food.pickup_address, 'donor location') || '. Live in-app tracking started.',
      jsonb_build_object('food_listing_id', p_food_listing_id, 'delivery_task_id', v_task_id, 'conversation_id', v_conv_id),
      p_food_listing_id, v_claim_id, v_task_id, '/rider-dashboard'
    );

    return jsonb_build_object(
      'accepted_by', 'rider',
      'rider_id', v_rider.id,
      'claim_id', v_claim_id,
      'delivery_task_id', v_task_id,
      'conversation_id', v_conv_id,
      'pickup_lat', v_food.latitude,
      'pickup_lng', v_food.longitude,
      'pickup_address', coalesce(v_food.pickup_address, v_food.city),
      'pickup_code', v_pickup_code,
      'status', 'rider_assigned',
      'rider_notified', true
    );

  else
    raise exception 'Your account role (%) is not eligible to accept food donations directly.', v_profile.role;
  end if;
end;
$$;

-- 4-argument wrapper for legacy callers
create or replace function public.accept_donation(
  p_food_listing_id   uuid,
  p_servings          integer default null,
  p_pickup_time       timestamptz default null,
  p_notes             text default null
)
returns jsonb
security definer
set search_path = public, extensions
language plpgsql as $$
begin
  return public.accept_donation(p_food_listing_id, p_servings, p_pickup_time, p_notes, 'ngo_delivery');
end;
$$;

grant execute on function public.accept_donation(uuid, integer, timestamptz, text, text) to authenticated;
grant execute on function public.accept_donation(uuid, integer, timestamptz, text) to authenticated;


-- ─── 2. update_donation_status RPC (Full direct and NGO lifecycle) ───────────
create or replace function public.update_donation_status(
  p_task_id    uuid,
  p_new_status text,
  p_notes      text default null
)
returns boolean
security definer
set search_path = public, extensions
language plpgsql as $$
declare
  v_uid          uuid := auth.uid();
  v_task         public.delivery_tasks%rowtype;
  v_rider        public.riders%rowtype;
  v_food         public.food_listings%rowtype;
  v_role         text;
  v_allowed      boolean := false;
begin
  if v_uid is null then
    raise exception 'Authentication required';
  end if;

  select * into v_task from public.delivery_tasks where id = p_task_id for update;
  if not found then
    raise exception 'Delivery task not found';
  end if;

  select * into v_rider from public.riders where user_id = v_uid;
  v_role := public.get_auth_user_role();

  -- Authorized: assigned rider (by riders.id or user_id), donor, NGO, or admin
  if not (
    v_role = 'admin'
    or (v_rider.id is not null and v_task.rider_id = v_rider.id)
    or v_task.rider_id = v_uid
    or v_task.donor_id = v_uid
    or v_task.ngo_id = v_uid
  ) then
    raise exception 'Not authorised to update this delivery status';
  end if;

  -- Lifecycle state transitions:
  -- rider_assigned -> going_to_pickup
  -- going_to_pickup -> arrived_at_pickup
  -- arrived_at_pickup -> food_collected
  -- food_collected -> in_transit, completed, delivered
  -- in_transit -> completed, delivered
  -- delivered -> completed
  if v_task.status::text = 'rider_assigned' and p_new_status in ('going_to_pickup', 'arrived_at_pickup', 'food_collected', 'incident') then v_allowed := true; end if;
  if v_task.status::text = 'going_to_pickup' and p_new_status in ('arrived_at_pickup', 'food_collected', 'incident') then v_allowed := true; end if;
  if v_task.status::text = 'arrived_at_pickup' and p_new_status in ('food_collected', 'incident') then v_allowed := true; end if;
  if v_task.status::text = 'food_collected' and p_new_status in ('in_transit', 'delivered', 'completed', 'incident') then v_allowed := true; end if;
  if v_task.status::text = 'in_transit' and p_new_status in ('delivered', 'completed', 'incident') then v_allowed := true; end if;
  if v_task.status::text = 'delivered' and p_new_status in ('completed') then v_allowed := true; end if;
  if v_role = 'admin' then v_allowed := true; end if;

  if not v_allowed then
    raise exception 'Invalid status transition from % to %', v_task.status, p_new_status;
  end if;

  -- Update delivery task
  update public.delivery_tasks
  set
    status = p_new_status::public.delivery_task_status,
    arrived_at_pickup_at = case when p_new_status = 'arrived_at_pickup' then coalesce(arrived_at_pickup_at, now()) else arrived_at_pickup_at end,
    pickup_confirmed_at = case when p_new_status = 'food_collected' then coalesce(pickup_confirmed_at, now()) else pickup_confirmed_at end,
    pickup_confirmed_by = case when p_new_status = 'food_collected' then coalesce(pickup_confirmed_by, v_uid) else pickup_confirmed_by end,
    servings_collected = case when p_new_status = 'food_collected' then coalesce(servings_collected, servings_required) else servings_collected end,
    delivery_confirmed_at = case when p_new_status in ('delivered', 'completed') then coalesce(delivery_confirmed_at, now()) else delivery_confirmed_at end,
    delivery_confirmed_by = case when p_new_status in ('delivered', 'completed') then coalesce(delivery_confirmed_by, v_uid) else delivery_confirmed_by end,
    completed_at = case when p_new_status = 'completed' then coalesce(completed_at, now()) else completed_at end,
    incident_reported = case when p_new_status = 'incident' then true else incident_reported end,
    incident_notes = case when p_new_status = 'incident' then coalesce(p_notes, incident_notes) else incident_notes end,
    updated_at = now()
  where id = p_task_id;

  -- Synchronize parent food_listings record
  if v_task.food_listing_id is not null then
    update public.food_listings
    set
      status = case
        when p_new_status = 'completed' then 'completed'::public.food_status
        when p_new_status in ('food_collected', 'in_transit', 'delivered') then 'picked_up'::public.food_status
        when p_new_status = 'cancelled' then 'cancelled'::public.food_status
        else status
      end,
      updated_at = now()
    where id = v_task.food_listing_id;
  end if;

  -- When delivery completes: free the rider & update rider delivery stats
  if p_new_status = 'completed' and v_task.rider_id is not null then
    update public.riders
    set
      is_available = true,
      total_deliveries = coalesce(total_deliveries, 0) + 1,
      total_distance_km = coalesce(total_distance_km, 0) + coalesce(v_task.estimated_km, 2.5),
      updated_at = now()
    where id = v_task.rider_id or user_id = v_uid;
  end if;

  -- Notifications to Donor based on Rider milestone
  if p_new_status = 'going_to_pickup' and v_task.donor_id is not null then
    insert into public.notifications (user_id, type, title, message, data, related_food_id, related_delivery_id, action_url)
    values (
      v_task.donor_id,
      'delivery_update',
      'Rider is On the Way to Pick Up Your Food!',
      'Rider is heading to your pickup location for "' || v_task.food_title || '". Please keep the food ready.',
      jsonb_build_object('delivery_task_id', p_task_id, 'food_listing_id', v_task.food_listing_id, 'status', p_new_status),
      v_task.food_listing_id, p_task_id, '/donor-dashboard'
    );
  elsif p_new_status = 'arrived_at_pickup' and v_task.donor_id is not null then
    insert into public.notifications (user_id, type, title, message, data, related_food_id, related_delivery_id, action_url)
    values (
      v_task.donor_id,
      'delivery_update',
      'Rider Has Arrived at Your Pickup Location!',
      'Your rider is outside! Share the 6-character verification code shown on your dashboard to complete the handover.',
      jsonb_build_object('delivery_task_id', p_task_id, 'food_listing_id', v_task.food_listing_id, 'status', p_new_status),
      v_task.food_listing_id, p_task_id, '/donor-dashboard'
    );
  elsif p_new_status = 'food_collected' and v_task.donor_id is not null then
    insert into public.notifications (user_id, type, title, message, data, related_food_id, related_delivery_id, action_url)
    values (
      v_task.donor_id,
      'food_collected',
      'Food Collected by Rider!',
      'Food handover verified! Rider has collected "' || v_task.food_title || '" and is now heading to deliver it.',
      jsonb_build_object('delivery_task_id', p_task_id, 'food_listing_id', v_task.food_listing_id, 'status', p_new_status),
      v_task.food_listing_id, p_task_id, '/donor-dashboard'
    );
  elsif p_new_status in ('delivered', 'completed') and v_task.donor_id is not null then
    insert into public.notifications (user_id, type, title, message, data, related_food_id, related_delivery_id, action_url)
    values (
      v_task.donor_id,
      'food_delivered',
      'Food Delivery Completed!',
      'Your donation "' || v_task.food_title || '" was delivered successfully! Thank you for feeding those in need.',
      jsonb_build_object('delivery_task_id', p_task_id, 'food_listing_id', v_task.food_listing_id, 'status', p_new_status),
      v_task.food_listing_id, p_task_id, '/donor-dashboard'
    );
  end if;

  return true;
end;
$$;

grant execute on function public.update_donation_status(uuid, text, text) to authenticated;


-- ─── 3. confirm_pickup RPC (Pure MD5 Donor Code Verification) ───────────────
create or replace function public.confirm_pickup(
  p_task_id            uuid,
  p_pickup_code        text,
  p_servings_collected integer default null,
  p_discrepancy_notes  text default null
)
returns boolean
security definer
set search_path = public, extensions
language plpgsql as $$
declare
  v_uid         uuid := auth.uid();
  v_task        public.delivery_tasks%rowtype;
  v_rider       public.riders%rowtype;
  v_derived     text;
begin
  if v_uid is null then
    raise exception 'Authentication required';
  end if;

  select * into v_task from public.delivery_tasks where id = p_task_id for update;
  if not found then
    raise exception 'Delivery task not found';
  end if;

  select * into v_rider from public.riders where user_id = v_uid;

  -- Authorized: assigned rider or donor
  if not (
    (v_rider.id is not null and v_task.rider_id = v_rider.id)
    or v_task.rider_id = v_uid
    or v_task.donor_id = v_uid
  ) then
    raise exception 'Only the assigned rider or donor can confirm food pickup';
  end if;

  -- Validate 6-character code
  v_derived := upper(substring(md5(v_task.food_listing_id::text), 1, 6));
  if upper(trim(p_pickup_code)) <> upper(trim(coalesce(v_task.pickup_code, '')))
     and upper(trim(p_pickup_code)) <> v_derived
  then
    raise exception 'Invalid pickup code. Please ask the donor for the 6-character code shown on their screen.';
  end if;

  -- Advance status to food_collected
  perform public.update_donation_status(p_task_id, 'food_collected', p_discrepancy_notes);
  return true;
end;
$$;

grant execute on function public.confirm_pickup(uuid, text, integer, text) to authenticated;
