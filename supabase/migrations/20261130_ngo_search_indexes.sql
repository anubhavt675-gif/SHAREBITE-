-- ==============================================================================
-- ShareBite — India-Wide NGO Discovery Search Indexes & Privacy-Safe Public RPCs
-- File: supabase/migrations/20261130_ngo_search_indexes.sql
--
-- SAFE & IDEMPOTENT PRODUCTION MIGRATION:
-- - Zero destructive DROP TABLE / TRUNCATE statements.
-- - Preserves all existing accounts, donations, deliveries, and messages.
-- - Uses role::text casting so it works cleanly with enum user_role.
-- - Guards pg_trgm & optional partner columns so it succeeds in a single run.
-- ==============================================================================

-- ─── 1. Safe Search Indexes on Existing Tables ────────────────────────────────
create index if not exists idx_profiles_ngo_role_city
  on public.profiles (city)
  where role in ('ngo', 'acceptor');

create index if not exists idx_profiles_org_name_lower
  on public.profiles (lower(organization_name))
  where organization_name is not null;

create index if not exists idx_profiles_city_lower
  on public.profiles (lower(city))
  where city is not null;

-- Optional trigram GIN indexes (handles Supabase `extensions` schema safely)
do $$
begin
  create extension if not exists pg_trgm;
  execute 'create index if not exists idx_profiles_org_name_trgm on public.profiles using gin (organization_name gin_trgm_ops) where organization_name is not null';
  execute 'create index if not exists idx_profiles_city_trgm on public.profiles using gin (city gin_trgm_ops) where city is not null';
  execute 'create index if not exists idx_profiles_address_trgm on public.profiles using gin (address gin_trgm_ops) where address is not null';
exception when others then
  -- If pg_trgm lives in extensions schema, try qualified operator class; otherwise B-tree indexes above remain active
  begin
    execute 'create index if not exists idx_profiles_org_name_trgm on public.profiles using gin (organization_name extensions.gin_trgm_ops) where organization_name is not null';
    execute 'create index if not exists idx_profiles_city_trgm on public.profiles using gin (city extensions.gin_trgm_ops) where city is not null';
    execute 'create index if not exists idx_profiles_address_trgm on public.profiles using gin (address extensions.gin_trgm_ops) where address is not null';
  exception when others then
    null;
  end;
end $$;

-- Optional partners indexes (only if columns exist in the current partners table)
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'partners' and column_name = 'organization_name'
  ) then
    execute 'create index if not exists idx_partners_org_name_lower on public.partners (lower(organization_name))';
  end if;

  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'partners' and column_name = 'city'
  ) then
    execute 'create index if not exists idx_partners_city_lower on public.partners (lower(city))';
  end if;
end $$;

-- ─── 2. Privacy-Safe Public Search RPC for ShareBite Registered NGOs ──────────
drop function if exists public.search_registered_ngos(text, text, text, integer);

create or replace function public.search_registered_ngos(
  p_query text default null,
  p_city text default null,
  p_state text default null,
  p_limit integer default 30
)
returns table (
  id uuid,
  organization_name text,
  full_name text,
  bio text,
  address text,
  city text,
  latitude double precision,
  longitude double precision,
  phone text,
  operating_hours text,
  is_verified boolean,
  avatar_url text,
  updated_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select
    p.id,
    p.organization_name,
    p.full_name,
    p.bio,
    p.address,
    p.city,
    p.latitude::double precision,
    p.longitude::double precision,
    p.phone,
    p.operating_hours,
    coalesce(p.is_verified, false) as is_verified,
    p.avatar_url,
    p.updated_at
  from public.profiles p
  where p.role::text in ('ngo', 'acceptor', 'receiver')
    and (
      p_query is null
      or trim(p_query) = ''
      or coalesce(p.organization_name, '') ilike '%' || trim(p_query) || '%'
      or coalesce(p.full_name, '') ilike '%' || trim(p_query) || '%'
      or coalesce(p.city, '') ilike '%' || trim(p_query) || '%'
      or coalesce(p.address, '') ilike '%' || trim(p_query) || '%'
      or coalesce(p.bio, '') ilike '%' || trim(p_query) || '%'
    )
    and (
      p_city is null
      or trim(p_city) = ''
      or coalesce(p.city, '') ilike '%' || trim(p_city) || '%'
      or coalesce(p.address, '') ilike '%' || trim(p_city) || '%'
    )
    and (
      p_state is null
      or trim(p_state) = ''
      or coalesce(p.address, '') ilike '%' || trim(p_state) || '%'
      or coalesce(p.city, '') ilike '%' || trim(p_state) || '%'
    )
  order by coalesce(p.is_verified, false) desc, p.updated_at desc nulls last
  limit greatest(1, least(coalesce(p_limit, 30), 60));
$$;

grant execute on function public.search_registered_ngos(text, text, text, integer) to anon, authenticated;

-- ─── 3. Privacy-Safe Public Detail RPC for a Single ShareBite Registered NGO ─
drop function if exists public.get_registered_ngo_by_id(uuid);

create or replace function public.get_registered_ngo_by_id(p_id uuid)
returns table (
  id uuid,
  organization_name text,
  full_name text,
  bio text,
  address text,
  city text,
  latitude double precision,
  longitude double precision,
  phone text,
  operating_hours text,
  is_verified boolean,
  avatar_url text,
  updated_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select
    p.id,
    p.organization_name,
    p.full_name,
    p.bio,
    p.address,
    p.city,
    p.latitude::double precision,
    p.longitude::double precision,
    p.phone,
    p.operating_hours,
    coalesce(p.is_verified, false) as is_verified,
    p.avatar_url,
    p.updated_at
  from public.profiles p
  where p.id = p_id
    and p.role::text in ('ngo', 'acceptor', 'receiver')
  limit 1;
$$;

grant execute on function public.get_registered_ngo_by_id(uuid) to anon, authenticated;
