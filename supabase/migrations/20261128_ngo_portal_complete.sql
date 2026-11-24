-- ==============================================================================
-- ShareBite Production Migration: Complete NGO Portal Integration
-- Preserves all existing Donor, Rider, Messaging, and Logistics tables & records.
-- 1. Extend food_requests for full NGO food request creation & fulfillment
-- 2. Create ngo_volunteers table with strict organization-scoped RLS
-- 3. Extend ngo_claims with Mode A capacity confirmation & food_request linkage
-- 4. Atomic RPCs: ngo_confirm_incoming_capacity (Mode A),
--    ngo_complete_direct_collection (Mode B, auto-closes Donor-NGO chat),
--    ngo_acknowledge_receipt (Mode A: records receipt without auto-completing rider)
-- 5. Strict RLS policies & Realtime publication registration
-- ==============================================================================

-- ─── 0. Prerequisite Helper ──────────────────────────────────────────────────
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
grant execute on function public.get_auth_user_role() to authenticated;

-- ─── 1. Extend food_requests Table ───────────────────────────────────────────
create table if not exists public.food_requests (
  id uuid primary key default gen_random_uuid(),
  ngo_id uuid references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.food_requests
  add column if not exists ngo_id uuid references public.profiles(id) on delete cascade,
  add column if not exists title text,
  add column if not exists food_type text default 'Cooked Meals',
  add column if not exists dietary_preference text default 'veg',
  add column if not exists people_count integer default 25,
  add column if not exists required_quantity numeric(10,2) default 25,
  add column if not exists fulfilled_quantity numeric(10,2) not null default 0,
  add column if not exists quantity_unit text not null default 'servings',
  add column if not exists needed_by timestamptz,
  add column if not exists urgency text not null default 'normal',
  add column if not exists collection_preference text not null default 'either',
  add column if not exists address text,
  add column if not exists city text,
  add column if not exists latitude double precision,
  add column if not exists longitude double precision,
  add column if not exists storage_requirements text,
  add column if not exists instructions text,
  add column if not exists status text not null default 'OPEN',
  add column if not exists updated_at timestamptz not null default now();

create index if not exists idx_food_requests_ngo_status on public.food_requests(ngo_id, status, created_at desc);
create index if not exists idx_food_requests_open on public.food_requests(status, needed_by asc);

-- ─── 2. Create ngo_volunteers Table ──────────────────────────────────────────
create table if not exists public.ngo_volunteers (
  id uuid primary key default gen_random_uuid(),
  ngo_id uuid not null references public.profiles(id) on delete cascade,
  profile_id uuid references public.profiles(id) on delete set null,
  full_name text not null,
  email text,
  phone text,
  volunteer_role text not null default 'collector',
  is_active boolean not null default true,
  is_available boolean not null default true,
  assigned_claim_id uuid references public.ngo_claims(id) on delete set null,
  assigned_task_label text,
  completed_collections integer not null default 0 check (completed_collections >= 0),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_ngo_volunteers_ngo on public.ngo_volunteers(ngo_id, is_active, created_at desc);

-- ─── 3. Extend ngo_claims for Mode A Capacity & Mode B Completion ────────────
alter table public.ngo_claims
  add column if not exists ngo_capacity_confirmed boolean not null default false,
  add column if not exists ngo_capacity_confirmed_at timestamptz,
  add column if not exists food_request_id uuid references public.food_requests(id) on delete set null,
  add column if not exists receipt_acknowledged_at timestamptz,
  add column if not exists completed_at timestamptz;

alter table public.profiles
  add column if not exists organization_description text,
  add column if not exists preferred_food_types text[],
  add column if not exists registration_number text,
  add column if not exists notification_preferences jsonb default '{}'::jsonb,
  add column if not exists collection_preferences jsonb default '{}'::jsonb;

-- ─── 4. Strict Row Level Security ────────────────────────────────────────────
alter table public.food_requests enable row level security;
alter table public.ngo_volunteers enable row level security;

-- Food requests: NGOs manage their own; authenticated donors & admins can read OPEN / PARTIALLY_FULFILLED
drop policy if exists "food_requests_select" on public.food_requests;
create policy "food_requests_select" on public.food_requests
  for select to authenticated
  using (
    ngo_id = auth.uid()
    or status in ('OPEN', 'PARTIALLY_FULFILLED')
    or public.get_auth_user_role() = 'admin'
  );

drop policy if exists "food_requests_insert_ngo" on public.food_requests;
create policy "food_requests_insert_ngo" on public.food_requests
  for insert to authenticated
  with check (
    ngo_id = auth.uid()
    and public.get_auth_user_role() in ('ngo', 'receiver', 'acceptor', 'admin')
  );

drop policy if exists "food_requests_update_ngo" on public.food_requests;
create policy "food_requests_update_ngo" on public.food_requests
  for update to authenticated
  using (ngo_id = auth.uid() or public.get_auth_user_role() = 'admin')
  with check (ngo_id = auth.uid() or public.get_auth_user_role() = 'admin');

drop policy if exists "food_requests_delete_ngo" on public.food_requests;
create policy "food_requests_delete_ngo" on public.food_requests
  for delete to authenticated
  using (ngo_id = auth.uid() or public.get_auth_user_role() = 'admin');

-- NGO volunteers: strictly isolated to the owning NGO organization
drop policy if exists "ngo_volunteers_org_select" on public.ngo_volunteers;
create policy "ngo_volunteers_org_select" on public.ngo_volunteers
  for select to authenticated
  using (ngo_id = auth.uid() or public.get_auth_user_role() = 'admin');

drop policy if exists "ngo_volunteers_org_insert" on public.ngo_volunteers;
create policy "ngo_volunteers_org_insert" on public.ngo_volunteers
  for insert to authenticated
  with check (
    ngo_id = auth.uid()
    and public.get_auth_user_role() in ('ngo', 'receiver', 'acceptor', 'admin')
  );

drop policy if exists "ngo_volunteers_org_update" on public.ngo_volunteers;
create policy "ngo_volunteers_org_update" on public.ngo_volunteers
  for update to authenticated
  using (ngo_id = auth.uid() or public.get_auth_user_role() = 'admin')
  with check (ngo_id = auth.uid() or public.get_auth_user_role() = 'admin');

drop policy if exists "ngo_volunteers_org_delete" on public.ngo_volunteers;
create policy "ngo_volunteers_org_delete" on public.ngo_volunteers
  for delete to authenticated
  using (ngo_id = auth.uid() or public.get_auth_user_role() = 'admin');

-- ─── 5. Mode A RPC: Confirm NGO Capacity Before Rider Delivery Leg ───────────
create or replace function public.ngo_confirm_incoming_capacity(p_claim_id uuid)
returns boolean
security definer
set search_path = public
language plpgsql as $$
declare
  v_uid   uuid := auth.uid();
  v_claim public.ngo_claims%rowtype;
begin
  if v_uid is null then
    raise exception 'Authentication required';
  end if;

  select * into v_claim from public.ngo_claims where id = p_claim_id for update;
  if not found then
    raise exception 'NGO claim not found';
  end if;

  if v_claim.ngo_id <> v_uid and public.get_auth_user_role() <> 'admin' then
    raise exception 'Unauthorized: only the assigned NGO can confirm capacity';
  end if;

  update public.ngo_claims
  set
    ngo_capacity_confirmed = true,
    ngo_capacity_confirmed_at = coalesce(ngo_capacity_confirmed_at, now()),
    updated_at = now()
  where id = p_claim_id;

  return true;
end;
$$;
grant execute on function public.ngo_confirm_incoming_capacity(uuid) to authenticated;

-- ─── 6. Mode B RPC: Complete Direct NGO Collection & Auto-Close Chat ─────────
create or replace function public.ngo_complete_direct_collection(
  p_claim_id          uuid,
  p_quantity_received numeric default null,
  p_condition_notes   text default null,
  p_safety_concern    boolean default false,
  p_safety_notes      text default null
)
returns uuid
security definer
set search_path = public
language plpgsql as $$
declare
  v_uid         uuid := auth.uid();
  v_claim       public.ngo_claims%rowtype;
  v_food        public.food_listings%rowtype;
  v_qty         numeric;
  v_dist_id     uuid;
begin
  if v_uid is null then
    raise exception 'Authentication required';
  end if;

  select * into v_claim from public.ngo_claims where id = p_claim_id for update;
  if not found then
    raise exception 'Collection claim not found';
  end if;

  if v_claim.ngo_id <> v_uid and public.get_auth_user_role() <> 'admin' then
    raise exception 'Unauthorized: only the assigned NGO can complete this direct collection';
  end if;

  if coalesce(v_claim.collection_method, 'ngo_delivery') <> 'direct_ngo_pickup' then
    raise exception 'Rider-assisted deliveries can only be marked completed by the assigned rider.';
  end if;

  select * into v_food from public.food_listings where id = v_claim.food_listing_id for update;
  v_qty := greatest(0, coalesce(p_quantity_received, v_claim.servings_claimed, 1));

  -- Mark claim & listing completed
  update public.ngo_claims
  set
    status = 'delivered'::public.claim_status,
    receipt_acknowledged_at = coalesce(receipt_acknowledged_at, now()),
    completed_at = coalesce(completed_at, now()),
    updated_at = now()
  where id = p_claim_id;

  if found and v_food.id is not null then
    update public.food_listings
    set status = 'completed'::public.food_status, updated_at = now()
    where id = v_food.id;
  end if;

  if v_claim.reservation_id is not null then
    update public.reservations
    set status = 'completed', updated_at = now()
    where id = v_claim.reservation_id;
  end if;

  -- Create or fetch idempotent distribution/receipt record
  select id into v_dist_id
  from public.distribution_records
  where claim_id = p_claim_id
  limit 1;

  if v_dist_id is null then
    insert into public.distribution_records (
      food_listing_id, claim_id, ngo_id, recorded_by,
      quantity_received, quantity_distributed, quantity_remaining, quantity_rejected,
      quantity_unit, status, condition_notes, safety_concern, safety_notes,
      receipt_confirmed_at
    ) values (
      v_claim.food_listing_id,
      p_claim_id,
      v_claim.ngo_id,
      v_uid,
      v_qty,
      0,
      case when p_safety_concern then 0 else v_qty end,
      case when p_safety_concern then v_qty else 0 end,
      coalesce(v_food.quantity_unit, 'servings'),
      case when p_safety_concern then 'rejected' else 'received' end,
      p_condition_notes,
      coalesce(p_safety_concern, false),
      p_safety_notes,
      now()
    )
    returning id into v_dist_id;
  end if;

  -- Update linked food_request fulfillment if not rejected
  if v_claim.food_request_id is not null and not coalesce(p_safety_concern, false) then
    update public.food_requests
    set
      fulfilled_quantity = fulfilled_quantity + v_qty,
      status = case
        when fulfilled_quantity + v_qty >= required_quantity then 'FULFILLED'
        else 'PARTIALLY_FULFILLED'
      end,
      updated_at = now()
    where id = v_claim.food_request_id;
  end if;

  -- Automatically close the Donor <-> NGO conversation on direct collection completion
  update public.conversations
  set status = 'CLOSED', closed_at = coalesce(closed_at, now()), updated_at = now()
  where related_listing_id = v_claim.food_listing_id
    and status = 'ACTIVE';

  -- Notify donor
  if v_food.donor_id is not null then
    begin
      insert into public.notifications (
        user_id, type, title, message, data, related_food_id, related_claim_id, action_url
      ) values (
        v_food.donor_id,
        'delivery_completed',
        'NGO Direct Collection Completed!',
        coalesce(v_claim.ngo_name, 'Assigned NGO') || ' completed direct collection of "' || coalesce(v_food.title, 'your donation') || '".',
        jsonb_build_object('food_listing_id', v_food.id, 'claim_id', p_claim_id, 'distribution_record_id', v_dist_id),
        v_food.id,
        p_claim_id,
        '/donor-donations'
      );
    exception when others then null;
    end;
  end if;

  return v_dist_id;
end;
$$;
grant execute on function public.ngo_complete_direct_collection(uuid, numeric, text, boolean, text) to authenticated;

-- ─── 7. Register NGO Tables in Supabase Realtime Publication ─────────────────
do $$ begin alter publication supabase_realtime add table public.food_requests; exception when others then null; end $$;
do $$ begin alter publication supabase_realtime add table public.ngo_volunteers; exception when others then null; end $$;
do $$ begin alter publication supabase_realtime add table public.ngo_claims; exception when others then null; end $$;
do $$ begin alter publication supabase_realtime add table public.distribution_records; exception when others then null; end $$;
