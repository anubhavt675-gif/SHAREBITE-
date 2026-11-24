-- ==============================================================================
-- SHAREBITE — COMPLETE DONOR, RIDER & NGO 3-PORTAL INTEGRATION MIGRATION
-- File: SHAREBITE_COMPLETE_INTEGRATION.sql
-- Versioned Copy: supabase/migrations/20261129_complete_three_portal_integration.sql
--
-- SAFE & IDEMPOTENT PRODUCTION MIGRATION:
-- - Zero destructive DROP TABLE / TRUNCATE / database reset statements.
-- - Preserves all existing users, food donations, claims, deliveries & messages.
-- - Compatible with Supabase SQL Editor (single execution).
-- ==============================================================================

-- ─── 1. REQUIRED EXTENSIONS ──────────────────────────────────────────────────
create extension if not exists pgcrypto;

-- ─── 2. SAFE ENUM EXTENSIONS (PostgreSQL Transaction-Safe) ───────────────────
do $$ begin alter type public.notification_type add value if not exists 'donation_created'; exception when others then null; end $$;
do $$ begin alter type public.notification_type add value if not exists 'new_donation'; exception when others then null; end $$;
do $$ begin alter type public.notification_type add value if not exists 'donation_claimed'; exception when others then null; end $$;
do $$ begin alter type public.notification_type add value if not exists 'rider_assigned'; exception when others then null; end $$;
do $$ begin alter type public.notification_type add value if not exists 'ngo_assigned'; exception when others then null; end $$;
do $$ begin alter type public.notification_type add value if not exists 'ngo_confirmed'; exception when others then null; end $$;
do $$ begin alter type public.notification_type add value if not exists 'ngo_declined'; exception when others then null; end $$;
do $$ begin alter type public.notification_type add value if not exists 'delivery_update'; exception when others then null; end $$;
do $$ begin alter type public.notification_type add value if not exists 'pickup_started'; exception when others then null; end $$;
do $$ begin alter type public.notification_type add value if not exists 'pickup_nearby'; exception when others then null; end $$;
do $$ begin alter type public.notification_type add value if not exists 'food_collected'; exception when others then null; end $$;
do $$ begin alter type public.notification_type add value if not exists 'food_delivered'; exception when others then null; end $$;
do $$ begin alter type public.notification_type add value if not exists 'delivery_completed'; exception when others then null; end $$;
do $$ begin alter type public.notification_type add value if not exists 'delivery_cancelled'; exception when others then null; end $$;
do $$ begin alter type public.notification_type add value if not exists 'new_message'; exception when others then null; end $$;
do $$ begin alter type public.notification_type add value if not exists 'food_request_fulfilled'; exception when others then null; end $$;

-- ─── 3. CORE HELPER FUNCTIONS ────────────────────────────────────────────────
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
revoke all on function public.get_auth_user_role() from public;
grant execute on function public.get_auth_user_role() to authenticated;

create or replace function public.set_updated_at()
returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- ─── 4. MISSING TABLES & COLUMN EXTENSIONS ───────────────────────────────────
-- 4A. Profiles extensions (NGO & staff configuration)
alter table public.profiles
  add column if not exists organization_description text,
  add column if not exists preferred_food_types text[],
  add column if not exists registration_number text,
  add column if not exists notification_preferences jsonb default '{}'::jsonb,
  add column if not exists collection_preferences jsonb default '{}'::jsonb;

-- 4B. Food Requests table & extended columns
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

-- 4C. NGO Volunteers table (strict organization scope)
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

-- 4D. NGO Claims Mode A / Mode B extensions
alter table public.ngo_claims
  add column if not exists ngo_capacity_confirmed boolean not null default false,
  add column if not exists ngo_capacity_confirmed_at timestamptz,
  add column if not exists food_request_id uuid references public.food_requests(id) on delete set null,
  add column if not exists receipt_acknowledged_at timestamptz,
  add column if not exists completed_at timestamptz;

-- 4E. Conversations: Support DONOR_RIDER, RIDER_NGO, and DONOR_NGO per delivery
alter table public.conversations
  add column if not exists status text not null default 'ACTIVE',
  add column if not exists closed_at timestamptz,
  add column if not exists donor_id uuid references public.profiles(id) on delete set null,
  add column if not exists rider_id uuid references public.profiles(id) on delete set null,
  add column if not exists ngo_id uuid references public.profiles(id) on delete set null,
  add column if not exists conversation_type text not null default 'DONOR_RIDER';

-- 4F. Messages: Idempotency key + read receipt timestamp
alter table public.messages
  add column if not exists read_at timestamptz,
  add column if not exists client_message_id text;

-- 4G. Notifications: Relational references & navigation URL
alter table public.notifications
  add column if not exists related_food_id uuid references public.food_listings(id) on delete set null,
  add column if not exists related_claim_id uuid,
  add column if not exists related_delivery_id uuid,
  add column if not exists action_url text;

-- 4H. Real Backend Activity Logs Table (Section 4.M)
create table if not exists public.activity_logs (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references public.profiles(id) on delete set null,
  donation_id uuid references public.food_listings(id) on delete set null,
  delivery_id uuid references public.delivery_tasks(id) on delete set null,
  claim_id uuid references public.ngo_claims(id) on delete set null,
  ngo_id uuid references public.profiles(id) on delete set null,
  event_type text not null,
  event_description text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

-- ─── 5. CONSTRAINTS & SAFE DATA BACKFILLS ────────────────────────────────────
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'conversations_status_check') then
    alter table public.conversations
      add constraint conversations_status_check check (status in ('ACTIVE', 'CLOSED'));
  end if;
exception when others then null;
end $$;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'conversations_type_check') then
    alter table public.conversations
      add constraint conversations_type_check
      check (conversation_type in ('DONOR_RIDER', 'RIDER_NGO', 'DONOR_NGO', 'DIRECT'));
  end if;
exception when others then null;
end $$;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'distribution_qty_bounds_check') then
    alter table public.distribution_records
      add constraint distribution_qty_bounds_check
      check (quantity_received >= 0 and quantity_distributed >= 0 and quantity_distributed <= quantity_received);
  end if;
exception when others then null;
end $$;

-- Backfill conversation donor_id / rider_id / ngo_id / conversation_type & close completed ones
update public.conversations c
set
  donor_id = coalesce(c.donor_id, dt.donor_id),
  rider_id = coalesce(c.rider_id, r.user_id),
  ngo_id = coalesce(c.ngo_id, dt.ngo_id),
  status = case when dt.status::text = 'completed' then 'CLOSED' else c.status end,
  closed_at = case when dt.status::text = 'completed' then coalesce(c.closed_at, dt.completed_at, now()) else c.closed_at end
from public.delivery_tasks dt
left join public.riders r on r.id = dt.rider_id
where c.related_task_id = dt.id;

update public.messages
set read_at = coalesce(read_at, created_at)
where is_read = true and read_at is null;

-- ─── 6. PERFORMANCE INDEXES & UNIQUENESS GUARANTEES ──────────────────────────
-- Replace single-conversation-per-task index with per-(task, conversation_type) so a delivery
-- can have BOTH a DONOR_RIDER and a RIDER_NGO private conversation without duplicates!
drop index if exists public.uq_conversations_delivery_task;
do $$
begin
  create unique index if not exists uq_conversations_task_type
    on public.conversations(related_task_id, conversation_type)
    where type = 'delivery' and related_task_id is not null;
exception when others then null;
end $$;

-- Message client idempotency unique index
do $$
begin
  create unique index if not exists uq_messages_conv_client_id
    on public.messages(conversation_id, client_message_id)
    where client_message_id is not null;
exception when others then null;
end $$;

create index if not exists idx_conversations_donor_id on public.conversations(donor_id);
create index if not exists idx_conversations_rider_id on public.conversations(rider_id);
create index if not exists idx_conversations_ngo_id on public.conversations(ngo_id);
create index if not exists idx_conversations_status_last_msg on public.conversations(status, last_message_at desc);
create index if not exists idx_messages_conv_created on public.messages(conversation_id, created_at desc);
create index if not exists idx_messages_conv_unread on public.messages(conversation_id, is_read) where is_read = false;
create index if not exists idx_food_requests_ngo_status on public.food_requests(ngo_id, status, created_at desc);
create index if not exists idx_food_requests_open on public.food_requests(status, needed_by asc);
create index if not exists idx_ngo_volunteers_ngo on public.ngo_volunteers(ngo_id, is_active, created_at desc);
create index if not exists idx_activity_logs_created on public.activity_logs(created_at desc);
create index if not exists idx_activity_logs_donation on public.activity_logs(donation_id, created_at desc);
create index if not exists idx_activity_logs_ngo on public.activity_logs(ngo_id, created_at desc);
create index if not exists idx_activity_logs_delivery on public.activity_logs(delivery_id, created_at desc);

-- ─── 7. TRIGGERS: CLOSURE GUARD, MESSAGE GUARD & AUTOMATIC ACTIVITY LOGGING ──
create or replace function public.can_access_conversation(p_conversation_id uuid)
returns boolean
security definer
set search_path = public
language plpgsql
stable as $$
declare
  v_uid  uuid := auth.uid();
  v_conv public.conversations%rowtype;
  v_task public.delivery_tasks%rowtype;
begin
  if v_uid is null then
    return false;
  end if;

  if not exists (
    select 1 from public.conversation_participants
    where conversation_id = p_conversation_id and user_id = v_uid
  ) then
    return false;
  end if;

  select * into v_conv from public.conversations where id = p_conversation_id;
  if not found then
    return false;
  end if;

  if v_conv.related_task_id is not null then
    select * into v_task from public.delivery_tasks where id = v_conv.related_task_id;
    if found then
      return (
        v_task.donor_id = v_uid
        or v_task.ngo_id = v_uid
        or v_task.rider_id = v_uid
        or exists (
          select 1 from public.riders r
          where r.id = v_task.rider_id and r.user_id = v_uid
        )
        or public.get_auth_user_role() = 'admin'
      );
    end if;
  end if;

  return true;
end;
$$;
revoke all on function public.can_access_conversation(uuid) from public;
grant execute on function public.can_access_conversation(uuid) to authenticated;

create or replace function public.is_conversation_active(p_conversation_id uuid)
returns boolean
security definer
set search_path = public
language plpgsql
stable as $$
declare
  v_conv public.conversations%rowtype;
  v_task_status text;
  v_listing_status text;
begin
  select * into v_conv from public.conversations where id = p_conversation_id;
  if not found then
    return false;
  end if;

  if coalesce(v_conv.status, 'ACTIVE') <> 'ACTIVE' or v_conv.closed_at is not null then
    return false;
  end if;

  if v_conv.related_task_id is not null then
    select status::text into v_task_status
    from public.delivery_tasks
    where id = v_conv.related_task_id;
    if v_task_status = 'completed' then
      return false;
    end if;
  elsif v_conv.related_listing_id is not null and v_conv.type = 'delivery' then
    select status::text into v_listing_status
    from public.food_listings
    where id = v_conv.related_listing_id;
    if v_listing_status = 'completed' then
      return false;
    end if;
  end if;

  return true;
end;
$$;
revoke all on function public.is_conversation_active(uuid) from public;
grant execute on function public.is_conversation_active(uuid) to authenticated;

create or replace function public.guard_conversation_closure()
returns trigger
language plpgsql as $$
begin
  if old.status = 'CLOSED' and (new.status <> 'CLOSED' or new.closed_at is null) then
    raise exception 'CONVERSATION_CLOSED: Delivery Completed. This conversation is now closed and cannot be reopened.';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_guard_conversation_closure on public.conversations;
create trigger trg_guard_conversation_closure
  before update on public.conversations
  for each row execute function public.guard_conversation_closure();

create or replace function public.guard_message_insert()
returns trigger
security definer
set search_path = public
language plpgsql as $$
begin
  if new.content is null or char_length(trim(new.content)) = 0 then
    raise exception 'EMPTY_MESSAGE: Message content cannot be empty.';
  end if;
  if char_length(new.content) > 2000 then
    raise exception 'MESSAGE_TOO_LONG: Message exceeds maximum length of 2000 characters.';
  end if;

  -- Lock parent conversation row to prevent race conditions during delivery completion closure
  perform 1 from public.conversations where id = new.conversation_id for share;

  if not public.is_conversation_active(new.conversation_id) then
    raise exception 'CONVERSATION_CLOSED: Delivery Completed. This conversation is now closed.';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_guard_message_insert on public.messages;
create trigger trg_guard_message_insert
  before insert on public.messages
  for each row execute function public.guard_message_insert();

-- Automatically close ALL delivery conversations (DONOR_RIDER, RIDER_NGO, DONOR_NGO) & log activity
create or replace function public.handle_delivery_task_lifecycle_events()
returns trigger
security definer
set search_path = public
language plpgsql as $$
begin
  if tg_op = 'UPDATE' and new.status is distinct from old.status then
    insert into public.activity_logs (
      actor_id, donation_id, delivery_id, claim_id, ngo_id, event_type, event_description, metadata
    ) values (
      auth.uid(),
      new.food_listing_id,
      new.id,
      new.claim_id,
      new.ngo_id,
      'delivery_status_' || new.status::text,
      'Delivery status transitioned from ' || coalesce(old.status::text, 'none') || ' to ' || new.status::text,
      jsonb_build_object('from', old.status::text, 'to', new.status::text)
    );

    if new.status::text = 'completed' then
      update public.conversations
      set status = 'CLOSED', closed_at = coalesce(closed_at, now()), updated_at = now()
      where (related_task_id = new.id or (related_listing_id = new.food_listing_id and type = 'delivery'))
        and status = 'ACTIVE';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_delivery_task_lifecycle_events on public.delivery_tasks;
create trigger trg_delivery_task_lifecycle_events
  after update on public.delivery_tasks
  for each row execute function public.handle_delivery_task_lifecycle_events();

-- ─── 8. SECURE 3-PORTAL RPC FUNCTIONS ────────────────────────────────────────

-- 8A. Get or create authorized private conversation (DONOR_RIDER, RIDER_NGO, or DONOR_NGO)
drop function if exists public.get_or_create_delivery_conversation(uuid, uuid);
drop function if exists public.get_or_create_delivery_conversation(uuid, uuid, text);
create or replace function public.get_or_create_delivery_conversation(
  p_food_listing_id   uuid,
  p_delivery_task_id  uuid default null,
  p_conversation_type text default 'DONOR_RIDER'
)
returns uuid
security definer
set search_path = public
language plpgsql as $$
declare
  v_uid        uuid := auth.uid();
  v_conv_type  text := upper(coalesce(p_conversation_type, 'DONOR_RIDER'));
  v_task       public.delivery_tasks%rowtype;
  v_food       public.food_listings%rowtype;
  v_claim      public.ngo_claims%rowtype;
  v_rider_uid  uuid;
  v_p1         uuid;
  v_p2         uuid;
  v_conv_id    uuid;
  v_title      text;
begin
  if v_uid is null then
    raise exception 'Authentication required';
  end if;

  if v_conv_type not in ('DONOR_RIDER', 'RIDER_NGO', 'DONOR_NGO') then
    raise exception 'Invalid conversation type "%"', p_conversation_type;
  end if;

  select * into v_food from public.food_listings where id = p_food_listing_id;
  if not found then
    raise exception 'Food donation not found';
  end if;

  if p_delivery_task_id is not null then
    select * into v_task from public.delivery_tasks where id = p_delivery_task_id;
  else
    select * into v_task from public.delivery_tasks where food_listing_id = p_food_listing_id order by created_at desc limit 1;
  end if;

  select * into v_claim from public.ngo_claims where food_listing_id = p_food_listing_id and status::text not in ('cancelled', 'expired') order by created_at desc limit 1;

  if v_task.rider_id is not null then
    select user_id into v_rider_uid from public.riders where id = v_task.rider_id;
  end if;
  v_rider_uid := coalesce(v_rider_uid, v_food.assigned_rider_id);

  if v_conv_type = 'DONOR_RIDER' then
    v_p1 := coalesce(v_task.donor_id, v_food.donor_id);
    v_p2 := v_rider_uid;
  elsif v_conv_type = 'RIDER_NGO' then
    v_p1 := v_rider_uid;
    v_p2 := coalesce(v_task.ngo_id, v_claim.ngo_id);
  else -- DONOR_NGO
    v_p1 := coalesce(v_task.donor_id, v_food.donor_id);
    v_p2 := coalesce(v_task.ngo_id, v_claim.ngo_id);
  end if;

  if v_p1 is null or v_p2 is null or v_p1 = v_p2 then
    raise exception 'Both authorized participants must be assigned before opening this % chat.', v_conv_type;
  end if;

  if v_uid not in (v_p1, v_p2) and public.get_auth_user_role() <> 'admin' then
    raise exception 'Unauthorized: only assigned participants can access this conversation';
  end if;

  -- Check existing conversation for this assignment & type
  select id into v_conv_id
  from public.conversations
  where conversation_type = v_conv_type
    and (
      (v_task.id is not null and related_task_id = v_task.id)
      or (v_task.id is null and related_listing_id = p_food_listing_id)
    )
  order by created_at desc
  limit 1;

  if v_conv_id is not null then
    insert into public.conversation_participants (conversation_id, user_id)
    values (v_conv_id, v_p1), (v_conv_id, v_p2)
    on conflict (conversation_id, user_id) do nothing;
    return v_conv_id;
  end if;

  v_title := coalesce(v_food.title, 'Food Rescue Coordination');

  insert into public.conversations (
    type, conversation_type, related_listing_id, related_task_id,
    donor_id, rider_id, ngo_id, title, status,
    closed_at, last_message_at
  ) values (
    'delivery',
    v_conv_type,
    p_food_listing_id,
    v_task.id,
    coalesce(v_task.donor_id, v_food.donor_id),
    v_rider_uid,
    coalesce(v_task.ngo_id, v_claim.ngo_id),
    v_title,
    case when v_task.status::text = 'completed' or v_food.status::text = 'completed' then 'CLOSED' else 'ACTIVE' end,
    case when v_task.status::text = 'completed' or v_food.status::text = 'completed' then now() else null end,
    now()
  )
  returning id into v_conv_id;

  insert into public.conversation_participants (conversation_id, user_id)
  values (v_conv_id, v_p1), (v_conv_id, v_p2)
  on conflict (conversation_id, user_id) do nothing;

  return v_conv_id;
end;
$$;
revoke all on function public.get_or_create_delivery_conversation(uuid, uuid, text) from public;
grant execute on function public.get_or_create_delivery_conversation(uuid, uuid, text) to authenticated;

-- 8B. Mode A: NGO Confirms Incoming Capacity -> Unlocks Rider<->NGO Chat & Notifies Rider/Donor
drop function if exists public.ngo_confirm_incoming_capacity(uuid);
create or replace function public.ngo_confirm_incoming_capacity(p_claim_id uuid)
returns jsonb
security definer
set search_path = public
language plpgsql as $$
declare
  v_uid        uuid := auth.uid();
  v_claim      public.ngo_claims%rowtype;
  v_task       public.delivery_tasks%rowtype;
  v_food       public.food_listings%rowtype;
  v_rider_uid  uuid;
  v_ngo_name   text;
  v_conv_id    uuid;
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

  select * into v_task from public.delivery_tasks where claim_id = p_claim_id order by created_at desc limit 1;
  select * into v_food from public.food_listings where id = v_claim.food_listing_id;
  select coalesce(organization_name, full_name, 'Assigned NGO') into v_ngo_name from public.profiles where id = v_claim.ngo_id;

  update public.ngo_claims
  set
    ngo_capacity_confirmed = true,
    ngo_capacity_confirmed_at = coalesce(ngo_capacity_confirmed_at, now()),
    updated_at = now()
  where id = p_claim_id;

  -- Create Rider <-> NGO private conversation if a rider is assigned
  if v_task.id is not null and v_task.rider_id is not null then
    select user_id into v_rider_uid from public.riders where id = v_task.rider_id;
    if v_rider_uid is not null then
      select public.get_or_create_delivery_conversation(v_claim.food_listing_id, v_task.id, 'RIDER_NGO') into v_conv_id;

      begin
        insert into public.notifications (
          user_id, type, title, message, data, related_food_id, related_claim_id, related_delivery_id, action_url
        ) values (
          v_rider_uid,
          'ngo_confirmed',
          'NGO Confirmed Incoming Delivery!',
          v_ngo_name || ' confirmed capacity for "' || coalesce(v_food.title, 'food donation') || '". Rider–NGO chat is now active.',
          jsonb_build_object('claim_id', p_claim_id, 'delivery_task_id', v_task.id, 'conversation_id', v_conv_id),
          v_claim.food_listing_id,
          p_claim_id,
          v_task.id,
          '/rider-dashboard'
        );
      exception when others then null;
      end;
    end if;
  end if;

  insert into public.activity_logs (
    actor_id, donation_id, delivery_id, claim_id, ngo_id, event_type, event_description
  ) values (
    v_uid,
    v_claim.food_listing_id,
    v_task.id,
    p_claim_id,
    v_claim.ngo_id,
    'ngo_capacity_confirmed',
    v_ngo_name || ' confirmed capacity to receive "' || coalesce(v_food.title, 'Food Donation') || '"'
  );

  return jsonb_build_object(
    'confirmed', true,
    'claim_id', p_claim_id,
    'conversation_id', v_conv_id
  );
end;
$$;
revoke all on function public.ngo_confirm_incoming_capacity(uuid) from public;
grant execute on function public.ngo_confirm_incoming_capacity(uuid) to authenticated;

-- 8C. Mode A: NGO Declines Incoming Assignment -> Auto-Reassigns Next Eligible NGO (No Fake NGO)
drop function if exists public.ngo_decline_incoming_assignment(uuid, text);
create or replace function public.ngo_decline_incoming_assignment(
  p_claim_id uuid,
  p_reason   text default null
)
returns jsonb
security definer
set search_path = public
language plpgsql as $$
declare
  v_uid           uuid := auth.uid();
  v_claim         public.ngo_claims%rowtype;
  v_task          public.delivery_tasks%rowtype;
  v_food          public.food_listings%rowtype;
  v_next_ngo      record;
  v_rider_uid     uuid;
  v_reassigned    boolean := false;
begin
  if v_uid is null then
    raise exception 'Authentication required';
  end if;

  select * into v_claim from public.ngo_claims where id = p_claim_id for update;
  if not found then
    raise exception 'NGO claim not found';
  end if;

  if v_claim.ngo_id <> v_uid and public.get_auth_user_role() <> 'admin' then
    raise exception 'Unauthorized: only the assigned NGO can decline this incoming delivery';
  end if;

  if coalesce(v_claim.collection_method, 'ngo_delivery') = 'direct_ngo_pickup' then
    raise exception 'Use Cancel Claim for direct NGO collections.';
  end if;

  select * into v_task from public.delivery_tasks where claim_id = p_claim_id for update;
  select * into v_food from public.food_listings where id = v_claim.food_listing_id;

  if v_task.id is not null and v_task.status::text in ('delivered', 'completed') then
    raise exception 'Cannot decline a delivery that has already been delivered or completed.';
  end if;

  -- Look for next nearest available NGO (excluding declining NGO)
  select
    p.id,
    coalesce(p.organization_name, p.full_name, 'Partner NGO') as ngo_name,
    p.address,
    p.latitude,
    p.longitude
  into v_next_ngo
  from public.profiles p
  where p.role::text in ('ngo', 'acceptor', 'receiver')
    and p.id <> v_claim.ngo_id
    and coalesce(p.is_available, true) = true
    and coalesce(p.daily_capacity, 100) >= coalesce(v_claim.servings_claimed, 1)
  order by
    coalesce(p.is_verified, false) desc,
    case
      when p.latitude is not null and p.longitude is not null and v_food.latitude is not null and v_food.longitude is not null
      then power(p.latitude - v_food.latitude, 2) + power(p.longitude - v_food.longitude, 2)
      else 999999
    end asc
  limit 1;

  if found and v_next_ngo.id is not null then
    v_reassigned := true;
    update public.ngo_claims
    set
      ngo_id = v_next_ngo.id,
      ngo_name = v_next_ngo.ngo_name,
      ngo_capacity_confirmed = false,
      ngo_capacity_confirmed_at = null,
      notes = coalesce(notes || E'\n', '') || 'Reassigned after decline: ' || coalesce(p_reason, 'Capacity unavailable'),
      updated_at = now()
    where id = p_claim_id;

    if v_task.id is not null then
      update public.delivery_tasks
      set
        ngo_id = v_next_ngo.id,
        dropoff_address = coalesce(v_next_ngo.address, dropoff_address),
        dropoff_lat = coalesce(v_next_ngo.latitude, dropoff_lat),
        dropoff_lng = coalesce(v_next_ngo.longitude, dropoff_lng),
        updated_at = now()
      where id = v_task.id;
    end if;

    -- Notify newly matched NGO
    begin
      insert into public.notifications (
        user_id, type, title, message, data, related_food_id, related_claim_id, related_delivery_id, action_url
      ) values (
        v_next_ngo.id,
        'ngo_assigned',
        'Incoming Food Delivery Request',
        'A rider is bringing "' || coalesce(v_food.title, 'surplus food') || '" (' || coalesce(v_claim.servings_claimed, 1) || ' servings). Please confirm capacity.',
        jsonb_build_object('claim_id', p_claim_id, 'delivery_task_id', v_task.id),
        v_claim.food_listing_id,
        p_claim_id,
        v_task.id,
        '/ngo/collections'
      );
    exception when others then null;
    end;
  else
    -- No eligible NGO available: keep honest pending reassignment state (never invent a fake NGO)
    update public.ngo_claims
    set
      status = 'cancelled'::public.claim_status,
      cancellation_reason = coalesce(p_reason, 'Declined by NGO — pending new NGO match'),
      updated_at = now()
    where id = p_claim_id;

    if v_task.id is not null then
      update public.delivery_tasks
      set
        ngo_id = null,
        dropoff_address = null,
        dropoff_lat = null,
        dropoff_lng = null,
        updated_at = now()
      where id = v_task.id;
    end if;
  end if;

  if v_task.rider_id is not null then
    select user_id into v_rider_uid from public.riders where id = v_task.rider_id;
    if v_rider_uid is not null then
      begin
        insert into public.notifications (
          user_id, type, title, message, data, related_food_id, related_delivery_id, action_url
        ) values (
          v_rider_uid,
          'ngo_declined',
          case when v_reassigned then 'Receiving NGO Updated' else 'Pending Receiving NGO Assignment' end,
          case
            when v_reassigned then 'Delivery reassigned to ' || v_next_ngo.ngo_name || '.'
            else 'Previous NGO declined capacity. Delivery is awaiting a new receiving NGO match.'
          end,
          jsonb_build_object('claim_id', p_claim_id, 'delivery_task_id', v_task.id, 'reassigned', v_reassigned),
          v_claim.food_listing_id,
          v_task.id,
          '/rider-dashboard'
        );
      exception when others then null;
      end;
    end if;
  end if;

  insert into public.activity_logs (
    actor_id, donation_id, delivery_id, claim_id, ngo_id, event_type, event_description, metadata
  ) values (
    v_uid,
    v_claim.food_listing_id,
    v_task.id,
    p_claim_id,
    v_uid,
    'ngo_assignment_declined',
    case when v_reassigned then 'NGO declined; reassigned to ' || v_next_ngo.ngo_name else 'NGO declined; awaiting eligible NGO' end,
    jsonb_build_object('reason', p_reason, 'reassigned', v_reassigned, 'next_ngo_id', case when v_reassigned then v_next_ngo.id else null end)
  );

  return jsonb_build_object(
    'declined', true,
    'reassigned', v_reassigned,
    'next_ngo_id', case when v_reassigned then v_next_ngo.id else null end,
    'next_ngo_name', case when v_reassigned then v_next_ngo.ngo_name else null end
  );
end;
$$;
revoke all on function public.ngo_decline_incoming_assignment(uuid, text) from public;
grant execute on function public.ngo_decline_incoming_assignment(uuid, text) to authenticated;

-- 8D. Mode B: Complete Direct NGO Collection (Records Receipt + Closes Donor-NGO Chat + Activity Log)
drop function if exists public.ngo_complete_direct_collection(uuid, numeric, text, boolean, text);
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

  update public.ngo_claims
  set
    status = 'delivered'::public.claim_status,
    receipt_acknowledged_at = coalesce(receipt_acknowledged_at, now()),
    completed_at = coalesce(completed_at, now()),
    updated_at = now()
  where id = p_claim_id;

  if v_food.id is not null then
    update public.food_listings
    set status = 'completed'::public.food_status, updated_at = now()
    where id = v_food.id;
  end if;

  if v_claim.reservation_id is not null then
    update public.reservations
    set status = 'completed', updated_at = now()
    where id = v_claim.reservation_id;
  end if;

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

  update public.conversations
  set status = 'CLOSED', closed_at = coalesce(closed_at, now()), updated_at = now()
  where related_listing_id = v_claim.food_listing_id
    and status = 'ACTIVE';

  insert into public.activity_logs (
    actor_id, donation_id, claim_id, ngo_id, event_type, event_description, metadata
  ) values (
    v_uid,
    v_claim.food_listing_id,
    p_claim_id,
    v_claim.ngo_id,
    'direct_ngo_collection_completed',
    'NGO completed direct collection of "' || coalesce(v_food.title, 'Food Donation') || '" (' || v_qty || ' servings)',
    jsonb_build_object('distribution_record_id', v_dist_id, 'safety_concern', coalesce(p_safety_concern, false))
  );

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
revoke all on function public.ngo_complete_direct_collection(uuid, numeric, text, boolean, text) from public;
grant execute on function public.ngo_complete_direct_collection(uuid, numeric, text, boolean, text) to authenticated;

-- 8E. Explicit Close Delivery Conversations RPC (Idempotent)
drop function if exists public.close_delivery_conversations(uuid, uuid);
create or replace function public.close_delivery_conversations(
  p_delivery_task_id uuid default null,
  p_food_listing_id  uuid default null
)
returns integer
security definer
set search_path = public
language plpgsql as $$
declare
  v_uid   uuid := auth.uid();
  v_count integer := 0;
begin
  if v_uid is null then
    raise exception 'Authentication required';
  end if;

  update public.conversations
  set status = 'CLOSED', closed_at = coalesce(closed_at, now()), updated_at = now()
  where status = 'ACTIVE'
    and (
      (p_delivery_task_id is not null and related_task_id = p_delivery_task_id)
      or (p_food_listing_id is not null and related_listing_id = p_food_listing_id and type = 'delivery')
    )
    and (
      donor_id = v_uid
      or rider_id = v_uid
      or ngo_id = v_uid
      or exists (
        select 1 from public.conversation_participants cp
        where cp.conversation_id = conversations.id and cp.user_id = v_uid
      )
      or public.get_auth_user_role() = 'admin'
    );

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;
revoke all on function public.close_delivery_conversations(uuid, uuid) from public;
grant execute on function public.close_delivery_conversations(uuid, uuid) to authenticated;

-- ─── 9. ROW LEVEL SECURITY POLICIES ──────────────────────────────────────────
alter table public.food_requests enable row level security;
alter table public.ngo_volunteers enable row level security;
alter table public.activity_logs enable row level security;
alter table public.conversations enable row level security;
alter table public.conversation_participants enable row level security;
alter table public.messages enable row level security;
alter table public.notifications enable row level security;

-- Activity Logs: visible only to actors/participants of the linked donation, delivery, or NGO
drop policy if exists "activity_logs_participant_select" on public.activity_logs;
create policy "activity_logs_participant_select" on public.activity_logs
  for select to authenticated
  using (
    actor_id = auth.uid()
    or ngo_id = auth.uid()
    or exists (select 1 from public.food_listings f where f.id = activity_logs.donation_id and (f.donor_id = auth.uid() or f.assigned_rider_id = auth.uid()))
    or exists (
      select 1 from public.delivery_tasks dt
      left join public.riders r on r.id = dt.rider_id
      where dt.id = activity_logs.delivery_id
        and (dt.donor_id = auth.uid() or dt.ngo_id = auth.uid() or r.user_id = auth.uid())
    )
    or public.get_auth_user_role() = 'admin'
  );

-- Food Requests RLS
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

-- NGO Volunteers RLS (strictly isolated to owning NGO)
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

-- Messages RLS: Strict participant access & zero inserts into CLOSED conversations
drop policy if exists "messages_select_participant" on public.messages;
create policy "messages_select_participant" on public.messages
  for select to authenticated
  using (public.can_access_conversation(conversation_id));

drop policy if exists "messages_insert_active_only" on public.messages;
create policy "messages_insert_active_only" on public.messages
  for insert to authenticated
  with check (
    sender_id = auth.uid()
    and public.can_access_conversation(conversation_id)
    and public.is_conversation_active(conversation_id)
  );

-- ─── 10. SUPABASE REALTIME PUBLICATION ───────────────────────────────────────
do $$ begin alter publication supabase_realtime add table public.food_listings; exception when others then null; end $$;
do $$ begin alter publication supabase_realtime add table public.ngo_claims; exception when others then null; end $$;
do $$ begin alter publication supabase_realtime add table public.delivery_tasks; exception when others then null; end $$;
do $$ begin alter publication supabase_realtime add table public.distribution_records; exception when others then null; end $$;
do $$ begin alter publication supabase_realtime add table public.rider_location_updates; exception when others then null; end $$;
do $$ begin alter publication supabase_realtime add table public.conversations; exception when others then null; end $$;
do $$ begin alter publication supabase_realtime add table public.messages; exception when others then null; end $$;
do $$ begin alter publication supabase_realtime add table public.notifications; exception when others then null; end $$;
do $$ begin alter publication supabase_realtime add table public.food_requests; exception when others then null; end $$;
do $$ begin alter publication supabase_realtime add table public.ngo_volunteers; exception when others then null; end $$;
do $$ begin alter publication supabase_realtime add table public.activity_logs; exception when others then null; end $$;

-- ─── 11. STORAGE BUCKET POLICIES (Safe Idempotent) ───────────────────────────
insert into storage.buckets (id, name, public)
values ('food-images', 'food-images', true)
on conflict (id) do nothing;

insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', true)
on conflict (id) do nothing;

-- ─── 12. POST-MIGRATION QUICK STATUS CHECK ───────────────────────────────────
select
  (select count(*) from information_schema.tables where table_schema = 'public' and table_name in (
    'profiles','food_listings','ngo_claims','delivery_tasks','distribution_records',
    'food_requests','ngo_volunteers','rider_location_updates','conversations',
    'conversation_participants','messages','notifications','activity_logs','riders'
  )) as core_tables_present,
  (select count(*) from pg_publication_tables where pubname = 'supabase_realtime') as realtime_tables_count;
