-- ==============================================================================
-- SHAREBITE — READ-ONLY DATABASE VALIDATION & INTEGRITY CHECKS
-- File: SHAREBITE_DATABASE_VALIDATION.sql
--
-- Safe to run in Supabase SQL Editor at any time.
-- Performs ZERO modifications to any table or record.
-- ==============================================================================

-- 1. Verify all required core tables exist
select table_name, 'PRESENT' as status
from information_schema.tables
where table_schema = 'public'
  and table_name in (
    'profiles',
    'food_listings',
    'ngo_claims',
    'delivery_tasks',
    'distribution_records',
    'food_requests',
    'ngo_volunteers',
    'rider_location_updates',
    'conversations',
    'conversation_participants',
    'messages',
    'notifications',
    'activity_logs',
    'donation_status_history',
    'riders',
    'partners'
  )
order by table_name;

-- 2. Verify required integration columns exist on key tables
select table_name, column_name, data_type
from information_schema.columns
where table_schema = 'public'
  and (
    (table_name = 'conversations' and column_name in ('status','closed_at','donor_id','rider_id','ngo_id','conversation_type'))
    or (table_name = 'messages' and column_name in ('read_at','client_message_id'))
    or (table_name = 'ngo_claims' and column_name in ('ngo_capacity_confirmed','food_request_id','receipt_acknowledged_at','completed_at'))
    or (table_name = 'food_requests' and column_name in ('ngo_id','title','required_quantity','fulfilled_quantity','status'))
    or (table_name = 'activity_logs' and column_name in ('actor_id','donation_id','delivery_id','event_type','event_description'))
  )
order by table_name, column_name;

-- 3. Verify Row Level Security (RLS) is ENABLED on all sensitive tables
select
  c.relname as table_name,
  c.relrowsecurity as rls_enabled,
  (select count(*) from pg_policies p where p.schemaname = 'public' and p.tablename = c.relname) as policy_count
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relkind = 'r'
  and c.relname in (
    'profiles','food_listings','ngo_claims','delivery_tasks','distribution_records',
    'food_requests','ngo_volunteers','rider_location_updates','conversations',
    'conversation_participants','messages','notifications','activity_logs','riders'
  )
order by c.relname;

-- 4. Verify required RPC functions exist with SECURITY DEFINER
select
  p.proname as function_name,
  pg_get_function_identity_arguments(p.oid) as arguments,
  p.prosecdef as security_definer
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in (
    'accept_donation',
    'update_donation_status',
    'confirm_pickup',
    'confirm_ngo_receipt',
    'record_distribution',
    'update_rider_location',
    'switch_user_role',
    'get_or_create_delivery_conversation',
    'ngo_confirm_incoming_capacity',
    'ngo_decline_incoming_assignment',
    'ngo_complete_direct_collection',
    'close_delivery_conversations',
    'can_access_conversation',
    'is_conversation_active'
  )
order by p.proname;

-- 5. Verify Supabase Realtime publication tables
select tablename as realtime_enabled_table
from pg_publication_tables
where pubname = 'supabase_realtime'
  and schemaname = 'public'
order by tablename;

-- 6. Verify required performance & uniqueness indexes exist
select tablename, indexname
from pg_indexes
where schemaname = 'public'
  and indexname in (
    'uq_conversations_task_type',
    'uq_messages_conv_client_id',
    'idx_conversations_status_last_msg',
    'idx_messages_conv_created',
    'idx_food_requests_ngo_status',
    'idx_ngo_volunteers_ngo',
    'idx_activity_logs_created'
  )
order by tablename, indexname;

-- 7. Integrity Check: No duplicate active independent assignments per food listing
select food_listing_id, count(*) as active_claims
from public.ngo_claims
where status::text not in ('cancelled', 'expired', 'distributed')
group by food_listing_id
having count(*) > 1;

-- 8. Integrity Check: No orphaned conversations referencing missing listings or tasks
select count(*) as orphaned_conversations
from public.conversations c
where (c.related_listing_id is not null and not exists (select 1 from public.food_listings f where f.id = c.related_listing_id))
   or (c.related_task_id is not null and not exists (select 1 from public.delivery_tasks dt where dt.id = c.related_task_id));

-- 9. Integrity Check: No orphaned messages referencing missing conversations
select count(*) as orphaned_messages
from public.messages m
where not exists (select 1 from public.conversations c where c.id = m.conversation_id);

-- 10. Integrity Check: All completed deliveries have CLOSED conversations (expected: 0)
select count(*) as unclosed_completed_conversations
from public.conversations c
join public.delivery_tasks dt on dt.id = c.related_task_id
where dt.status::text = 'completed'
  and coalesce(c.status, 'ACTIVE') <> 'CLOSED';

-- 11. Integrity Check: Active deliveries reference valid donor and listing
select count(*) as invalid_active_deliveries
from public.delivery_tasks dt
where dt.status::text not in ('completed', 'cancelled')
  and (
    not exists (select 1 from public.food_listings f where f.id = dt.food_listing_id)
    or not exists (select 1 from public.profiles p where p.id = dt.donor_id)
  );

-- 12. Integrity Check: Distributed quantity never exceeds received quantity (expected: 0)
select count(*) as over_distributed_records
from public.distribution_records
where quantity_distributed > quantity_received;

-- 13. Integrity Check: NGO receipts reference valid listings & NGO profiles (expected: 0)
select count(*) as invalid_receipt_records
from public.distribution_records dr
where not exists (select 1 from public.profiles p where p.id = dr.ngo_id)
   or (dr.food_listing_id is not null and not exists (select 1 from public.food_listings f where f.id = dr.food_listing_id));

-- 14. Role Distribution Summary (Read-Only Sanity Check)
select role::text as profile_role, count(*) as user_count
from public.profiles
group by role::text
order by user_count desc;
