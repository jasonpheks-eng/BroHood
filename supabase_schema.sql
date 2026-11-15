-- BrotherHood Storefront Supabase Schema & Public Media Bucket Setup
-- Run this SQL once in your Supabase SQL Editor to enable full Supabase table & file storage sync.

create table if not exists public.products (
  id text primary key,
  name text not null,
  price numeric not null default 0,
  category text not null default 'SHIRTS',
  collection text not null default 'legacy',
  image_url text,
  gallery_images jsonb not null default '[]'::jsonb,
  image_color text not null default '#F8F7F3',
  variants jsonb not null default '[]'::jsonb,
  total_stock integer,
  description text,
  details jsonb,
  updated_at timestamptz not null default now()
);

create table if not exists public.settings (
  id text primary key,
  brand_name text not null default 'BROTHERHOOD',
  logo_url text,
  hero_image_url text,
  hero_video_url text,
  hero_video_urls jsonb not null default '[]'::jsonb,
  about_us_title text,
  about_us_text text,
  whatsapp_number text default '',
  raw_settings jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

create table if not exists public.creators_club (
  id text primary key,
  creator_name text not null,
  handle text not null,
  avatar_url text,
  media_url text not null,
  is_video boolean not null default false,
  social_link text,
  caption text,
  tagged_product_ids jsonb not null default '[]'::jsonb,
  featured boolean not null default true,
  updated_at timestamptz not null default now()
);

create table if not exists public.studio_gallery (
  id text primary key,
  layout_mode text not null default 'all',
  title_layout text not null default 'tile-corner',
  text_animation text not null default 'fadeUp',
  kicker text default '',
  header_title text default '',
  header_description text default '',
  items jsonb not null default '[]'::jsonb,
  raw_gallery jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.products enable row level security;
alter table public.settings enable row level security;
alter table public.creators_club enable row level security;
alter table public.studio_gallery enable row level security;

drop policy if exists "Allow public read/write products" on public.products;
create policy "Allow public read/write products" on public.products for all using (true) with check (true);

drop policy if exists "Allow public read/write settings" on public.settings;
create policy "Allow public read/write settings" on public.settings for all using (true) with check (true);

drop policy if exists "Allow public read/write creators_club" on public.creators_club;
create policy "Allow public read/write creators_club" on public.creators_club for all using (true) with check (true);

drop policy if exists "Allow public read/write studio_gallery" on public.studio_gallery;
create policy "Allow public read/write studio_gallery" on public.studio_gallery for all using (true) with check (true);

insert into storage.buckets (id, name, public)
values ('media', 'media', true)
on conflict (id) do update set public = true;

drop policy if exists "Public read media" on storage.objects;
create policy "Public read media" on storage.objects for select using (bucket_id = 'media');

drop policy if exists "Public upload media" on storage.objects;
create policy "Public upload media" on storage.objects for insert with check (bucket_id = 'media');

drop policy if exists "Public update media" on storage.objects;
create policy "Public update media" on storage.objects for update using (bucket_id = 'media');

-- Enable real-time postgres_changes replication across all connected storefront devices
alter table public.products replica identity full;
alter table public.settings replica identity full;
alter table public.creators_club replica identity full;
alter table public.studio_gallery replica identity full;

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'products'
  ) then
    alter publication supabase_realtime add table public.products;
  end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'settings'
  ) then
    alter publication supabase_realtime add table public.settings;
  end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'creators_club'
  ) then
    alter publication supabase_realtime add table public.creators_club;
  end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'studio_gallery'
  ) then
    alter publication supabase_realtime add table public.studio_gallery;
  end if;
end $$;

