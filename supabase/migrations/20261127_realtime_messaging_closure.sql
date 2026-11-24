-- ==============================================================================
-- ShareBite Production Migration: Real-Time Donor & Rider Messaging System
-- Phases 2, 3, 7, 8, 9:
-- 1. Extend conversations (status ACTIVE/CLOSED, closed_at, donor_id, rider_id)
--    and messages (read_at, length validation)
-- 2. Unique conversation per delivery/donation + performance indexes
-- 3. Strict RLS: Only original Donor & assigned Rider can access; ZERO inserts
--    into CLOSED conversations (even via direct API); users cannot unlock chat
-- 4. Automatic conversation closure trigger when delivery_tasks.status -> completed
-- 5. Real-time publication & deduplicated notifications
-- ==============================================================================

-- ─── 0. Prerequisite Helpers (Idempotent) ────────────────────────────────────
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

-- ─── 1. Schema Extensions on Existing Messaging & Notifications Tables ───────
alter table public.notifications
  add column if not exists related_food_id uuid references public.food_listings(id) on delete set null,
  add column if not exists related_claim_id uuid,
  add column if not exists related_delivery_id uuid,
  add column if not exists action_url text;

alter table public.conversations
  add column if not exists status text not null default 'ACTIVE',
  add column if not exists closed_at timestamptz,
  add column if not exists donor_id uuid references public.profiles(id) on delete set null,
  add column if not exists rider_id uuid references public.profiles(id) on delete set null;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'conversations_status_check'
  ) then
    alter table public.conversations
      add constraint conversations_status_check check (status in ('ACTIVE', 'CLOSED'));
  end if;
end $$;

alter table public.messages
  add column if not exists read_at timestamptz;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'messages_content_length_check'
  ) then
    alter table public.messages
      add constraint messages_content_length_check
      check (char_length(trim(content)) >= 1 and char_length(content) <= 2000);
  end if;
exception when others then
  -- Skip constraint if legacy rows contain empty strings
  null;
end $$;

-- Backfill donor_id / rider_id & close conversations whose tasks are already completed
update public.conversations c
set
  donor_id = coalesce(c.donor_id, dt.donor_id),
  rider_id = coalesce(c.rider_id, r.user_id),
  status = case when dt.status::text = 'completed' then 'CLOSED' else c.status end,
  closed_at = case when dt.status::text = 'completed' then coalesce(c.closed_at, dt.completed_at, now()) else c.closed_at end
from public.delivery_tasks dt
left join public.riders r on r.id = dt.rider_id
where c.related_task_id = dt.id;

-- Backfill read_at for already-read messages
update public.messages
set read_at = coalesce(read_at, created_at)
where is_read = true and read_at is null;

-- ─── 2. Indexes & Uniqueness Guarantees ──────────────────────────────────────
create index if not exists idx_conversations_donor_id on public.conversations(donor_id);
create index if not exists idx_conversations_rider_id on public.conversations(rider_id);
create index if not exists idx_conversations_status_last_msg on public.conversations(status, last_message_at desc);
create index if not exists idx_conversations_related_task on public.conversations(related_task_id);
create index if not exists idx_conversations_related_listing on public.conversations(related_listing_id);
create index if not exists idx_messages_conv_created on public.messages(conversation_id, created_at desc);
create index if not exists idx_messages_conv_unread on public.messages(conversation_id, is_read) where is_read = false;

-- Prevent duplicate delivery conversations for the same task
do $$
begin
  create unique index if not exists uq_conversations_delivery_task
    on public.conversations(related_task_id)
    where type = 'delivery' and related_task_id is not null;
exception when others then
  null;
end $$;

-- ─── 3. Strict Access & Closure Verification Functions ───────────────────────
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

  -- If linked to a delivery task, strictly verify caller is donor, assigned rider, assigned NGO, or admin
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

  -- Direct donor_id / rider_id verification when present
  if v_conv.donor_id is not null and v_conv.rider_id is not null then
    return (
      v_uid in (v_conv.donor_id, v_conv.rider_id)
      or public.get_auth_user_role() = 'admin'
    );
  end if;

  return true;
end;
$$;
grant execute on function public.can_access_conversation(uuid) to authenticated;

-- Returns TRUE only when the conversation is ACTIVE and its linked delivery is NOT completed
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
grant execute on function public.is_conversation_active(uuid) to authenticated;

-- ─── 4. Guard Trigger: Prevent Unlocking Closed Conversations ────────────────
create or replace function public.guard_conversation_closure()
returns trigger
language plpgsql as $$
begin
  -- Once CLOSED, nobody (donor or rider) may revert status to ACTIVE or clear closed_at
  if old.status = 'CLOSED' and (new.status <> 'CLOSED' or new.closed_at is null) then
    raise exception 'CONVERSATION_CLOSED: Closed conversations cannot be reopened after delivery completion.';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_guard_conversation_closure on public.conversations;
create trigger trg_guard_conversation_closure
  before update on public.conversations
  for each row execute function public.guard_conversation_closure();

-- Guard Trigger on messages: Enforce backend rejection on CLOSED conversations
create or replace function public.guard_message_insert()
returns trigger
security definer
set search_path = public
language plpgsql as $$
begin
  -- Validate message content length
  if new.content is null or char_length(trim(new.content)) = 0 then
    raise exception 'EMPTY_MESSAGE: Message content cannot be empty.';
  end if;
  if char_length(new.content) > 2000 then
    raise exception 'MESSAGE_TOO_LONG: Message exceeds maximum length of 2000 characters.';
  end if;

  -- Allow system closure notice inserted by internal triggers; block all user messages in CLOSED threads
  if coalesce(new.message_type, 'text') <> 'system' then
    if not public.is_conversation_active(new.conversation_id) then
      raise exception 'CONVERSATION_CLOSED: This conversation is closed because the delivery has been completed.';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_guard_message_insert on public.messages;
create trigger trg_guard_message_insert
  before insert on public.messages
  for each row execute function public.guard_message_insert();

-- ─── 5. Strict Row Level Security Policies ───────────────────────────────────
alter table public.conversations enable row level security;
alter table public.conversation_participants enable row level security;
alter table public.messages enable row level security;

drop policy if exists "conv_participant_select" on public.conversations;
create policy "conv_participant_select" on public.conversations
  for select to authenticated
  using (public.can_access_conversation(id));

drop policy if exists "conv_participant_update" on public.conversations;
create policy "conv_participant_update" on public.conversations
  for update to authenticated
  using (public.can_access_conversation(id))
  with check (public.can_access_conversation(id));

drop policy if exists "msg_select" on public.messages;
create policy "msg_select" on public.messages
  for select to authenticated
  using (public.can_access_conversation(conversation_id));

drop policy if exists "msg_insert" on public.messages;
create policy "msg_insert" on public.messages
  for insert to authenticated
  with check (
    sender_id = auth.uid()
    and public.can_access_conversation(conversation_id)
    and public.is_conversation_active(conversation_id)
    and char_length(trim(content)) between 1 and 2000
  );

drop policy if exists "msg_update_read" on public.messages;
create policy "msg_update_read" on public.messages
  for update to authenticated
  using (public.can_access_conversation(conversation_id))
  with check (public.can_access_conversation(conversation_id));

-- ─── 6. Automatic Chat Closure Trigger When Delivery Status -> COMPLETED ─────
create or replace function public.close_conversation_for_delivery(
  p_delivery_task_id uuid,
  p_food_listing_id  uuid default null
)
returns integer
security definer
set search_path = public
language plpgsql as $$
declare
  v_conv    record;
  v_closed  integer := 0;
  v_actor   uuid := auth.uid();
  v_sys_sender uuid;
begin
  for v_conv in
    select *
    from public.conversations
    where status = 'ACTIVE'
      and (
        (p_delivery_task_id is not null and related_task_id = p_delivery_task_id)
        or (p_food_listing_id is not null and related_listing_id = p_food_listing_id and type = 'delivery')
      )
  loop
    update public.conversations
    set
      status = 'CLOSED',
      closed_at = coalesce(closed_at, now()),
      updated_at = now()
    where id = v_conv.id;

    v_sys_sender := coalesce(v_actor, v_conv.rider_id, v_conv.donor_id);
    if v_sys_sender is not null and not exists (
      select 1 from public.messages
      where conversation_id = v_conv.id
        and message_type = 'system'
        and content like '%conversation is now closed%'
    ) then
      insert into public.messages (conversation_id, sender_id, content, message_type, is_read, read_at)
      values (
        v_conv.id,
        v_sys_sender,
        'Delivery Completed — This conversation is now closed. You can still view your previous messages.',
        'system',
        true,
        now()
      );
    end if;

    v_closed := v_closed + 1;
  end loop;

  return v_closed;
end;
$$;
grant execute on function public.close_conversation_for_delivery(uuid, uuid) to authenticated;

create or replace function public.handle_delivery_task_completed()
returns trigger
security definer
set search_path = public
language plpgsql as $$
declare
  v_rider_uid uuid;
begin
  if new.status::text = 'completed' and coalesce(old.status::text, '') <> 'completed' then
    perform public.close_conversation_for_delivery(new.id, new.food_listing_id);

    -- Notify assigned rider that delivery completed successfully (deduplicated)
    select user_id into v_rider_uid from public.riders where id = new.rider_id;
    v_rider_uid := coalesce(v_rider_uid, new.rider_id);

    if v_rider_uid is not null and not exists (
      select 1 from public.notifications
      where user_id = v_rider_uid
        and related_delivery_id = new.id
        and title = 'Delivery Completed Successfully!'
    ) then
      insert into public.notifications (
        user_id, type, title, message, data, related_food_id, related_delivery_id, action_url
      ) values (
        v_rider_uid,
        'system',
        'Delivery Completed Successfully!',
        'Delivery completed successfully for "' || coalesce(new.food_title, 'Food Donation') || '". The pickup chat is now archived as read-only.',
        jsonb_build_object('delivery_task_id', new.id, 'food_listing_id', new.food_listing_id, 'status', 'completed'),
        new.food_listing_id,
        new.id,
        '/rider/deliveries'
      );
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_handle_delivery_task_completed on public.delivery_tasks;
create trigger trg_handle_delivery_task_completed
  after update of status on public.delivery_tasks
  for each row execute function public.handle_delivery_task_completed();

-- Also close linked delivery conversation if food_listings transitions to completed directly
create or replace function public.handle_food_listing_completed()
returns trigger
security definer
set search_path = public
language plpgsql as $$
begin
  if new.status::text = 'completed' and coalesce(old.status::text, '') <> 'completed' then
    perform public.close_conversation_for_delivery(null, new.id);
  end if;
  return new;
end;
$$;

drop trigger if exists trg_handle_food_listing_completed on public.food_listings;
create trigger trg_handle_food_listing_completed
  after update of status on public.food_listings
  for each row execute function public.handle_food_listing_completed();

-- ─── 7. Upgrade get_or_create_delivery_conversation (Strict + Idempotent) ───
drop function if exists public.get_or_create_delivery_conversation(uuid, uuid);
create or replace function public.get_or_create_delivery_conversation(
  p_food_listing_id  uuid,
  p_delivery_task_id uuid default null
)
returns uuid
security definer
set search_path = public
language plpgsql as $$
declare
  v_uid           uuid := auth.uid();
  v_food          public.food_listings%rowtype;
  v_task          public.delivery_tasks%rowtype;
  v_rider_user_id uuid;
  v_conv_id       uuid;
  v_is_completed  boolean := false;
begin
  if v_uid is null then
    raise exception 'Authentication required';
  end if;

  select * into v_food from public.food_listings where id = p_food_listing_id;
  if not found then
    raise exception 'Food donation not found';
  end if;

  if p_delivery_task_id is not null then
    select * into v_task from public.delivery_tasks where id = p_delivery_task_id;
  else
    select * into v_task
    from public.delivery_tasks
    where food_listing_id = p_food_listing_id
      and status not in ('cancelled')
    order by created_at desc
    limit 1;
  end if;

  if v_task.id is not null and v_task.rider_id is not null then
    select user_id into v_rider_user_id from public.riders where id = v_task.rider_id;
    v_rider_user_id := coalesce(v_rider_user_id, v_task.rider_id);
  elsif v_food.assigned_rider_id is not null then
    select user_id into v_rider_user_id from public.riders where id = v_food.assigned_rider_id;
    v_rider_user_id := coalesce(v_rider_user_id, v_food.assigned_rider_id);
  end if;

  if v_rider_user_id is null then
    raise exception 'No rider is currently assigned to this donation. Chat unlocks after acceptance.';
  end if;

  if v_uid not in (v_food.donor_id, v_rider_user_id)
     and (v_task.ngo_id is null or v_uid <> v_task.ngo_id)
     and coalesce(public.get_auth_user_role(), '') <> 'admin' then
    raise exception 'Unauthorized: only the donor and assigned rider can access this conversation';
  end if;

  -- Reuse existing conversation for this task/listing
  select c.id into v_conv_id
  from public.conversations c
  where (
      (v_task.id is not null and c.related_task_id = v_task.id)
      or (c.related_listing_id = p_food_listing_id and c.type = 'delivery')
    )
    and exists (select 1 from public.conversation_participants cp1 where cp1.conversation_id = c.id and cp1.user_id = v_food.donor_id)
    and exists (select 1 from public.conversation_participants cp2 where cp2.conversation_id = c.id and cp2.user_id = v_rider_user_id)
  order by c.created_at desc
  limit 1;

  if v_conv_id is null then
    v_is_completed := (coalesce(v_task.status::text, '') = 'completed' or v_food.status::text = 'completed');

    insert into public.conversations (
      type, related_listing_id, related_task_id, donor_id, rider_id, title,
      status, closed_at, last_message_at
    )
    values (
      'delivery', p_food_listing_id, v_task.id, v_food.donor_id, v_rider_user_id, v_food.title,
      case when v_is_completed then 'CLOSED' else 'ACTIVE' end,
      case when v_is_completed then now() else null end,
      now()
    )
    returning id into v_conv_id;

    insert into public.conversation_participants (conversation_id, user_id, role)
    values
      (v_conv_id, v_food.donor_id, 'donor'),
      (v_conv_id, v_rider_user_id, 'rider')
    on conflict (conversation_id, user_id) do nothing;
  end if;

  return v_conv_id;
end;
$$;
grant execute on function public.get_or_create_delivery_conversation(uuid, uuid) to authenticated;

-- ─── 8. Harden Chat Message Trigger (Never Roll Back Message on Notif Error) ─
create or replace function public.handle_new_chat_message()
returns trigger
security definer
set search_path = public
language plpgsql as $$
declare
  v_sender_name text;
  v_conv        public.conversations%rowtype;
  v_part        record;
begin
  update public.conversations
  set last_message_at = new.created_at,
      updated_at = new.created_at
  where id = new.conversation_id
  returning * into v_conv;

  if coalesce(new.message_type, 'text') = 'system' then
    return new;
  end if;

  select coalesce(full_name, organization_name, 'ShareBite Partner')
  into v_sender_name
  from public.profiles
  where id = new.sender_id;

  for v_part in
    select user_id from public.conversation_participants
    where conversation_id = new.conversation_id
      and user_id <> new.sender_id
  loop
    begin
      insert into public.notifications (
        user_id, type, title, message, data, related_food_id, related_delivery_id, action_url
      ) values (
        v_part.user_id,
        'new_message',
        'New Message from ' || coalesce(v_sender_name, 'Partner'),
        left(new.content, 140),
        jsonb_build_object(
          'conversation_id', new.conversation_id,
          'message_id', new.id,
          'sender_id', new.sender_id
        ),
        v_conv.related_listing_id,
        v_conv.related_task_id,
        '/chat/' || new.conversation_id
      );
    exception when others then
      begin
        insert into public.notifications (user_id, type, title, message, data, action_url)
        values (
          v_part.user_id,
          'system',
          'New Message from ' || coalesce(v_sender_name, 'Partner'),
          left(new.content, 140),
          jsonb_build_object('conversation_id', new.conversation_id, 'sender_id', new.sender_id),
          '/chat/' || new.conversation_id
        );
      exception when others then
        null;
      end;
    end;
  end loop;

  return new;
end;
$$;

drop trigger if exists trg_handle_new_chat_message on public.messages;
create trigger trg_handle_new_chat_message
  after insert on public.messages
  for each row execute function public.handle_new_chat_message();

-- ─── 9. Ensure Single Unambiguous accept_donation Signature (No PGRST203) ────
drop function if exists public.accept_donation(uuid, integer, timestamptz, text);

-- ─── 9. Ensure Realtime Publication Includes Messaging Tables ────────────────
do $$ begin alter publication supabase_realtime add table public.conversations; exception when others then null; end $$;
do $$ begin alter publication supabase_realtime add table public.conversation_participants; exception when others then null; end $$;
do $$ begin alter publication supabase_realtime add table public.messages; exception when others then null; end $$;
do $$ begin alter publication supabase_realtime add table public.delivery_tasks; exception when others then null; end $$;
do $$ begin alter publication supabase_realtime add table public.notifications; exception when others then null; end $$;
