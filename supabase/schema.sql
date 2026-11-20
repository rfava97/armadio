-- Armadio — schema Supabase (Postgres)
-- Utente unico, ma tutto è legato a auth.uid() con RLS.

create type garment_category as enum (
  'maglie', 'camicie', 'canotte', 'felpe_maglioni', 'gilet', 'giacche_cappotti',
  'pantaloni', 'jeans', 'scarpe', 'accessori'
);

create type body_zone as enum ('busto', 'gambe', 'piedi', 'accessorio');

create type avatar_mode as enum ('manichino', 'foto');

create type outfit_style as enum ('casual', 'elegante', 'sport', 'serata', 'lavoro', 'estate', 'altro');

-- Profilo e misure
create table profiles (
  user_id uuid primary key references auth.users on delete cascade,
  avatar_mode avatar_mode not null default 'manichino',
  body_shape smallint not null default 85 check (body_shape between 0 and 100), -- 0 femminile, 100 maschile
  height_cm numeric(5,1) not null default 174,
  weight_kg numeric(5,1),
  shoulders_cm numeric(5,1),
  chest_cm numeric(5,1),
  waist_cm numeric(5,1) default 78,
  hips_cm numeric(5,1) default 93,
  legs_cm numeric(5,1),
  body_photo_path text,            -- storage: body/<user_id>/...
  body_anchors jsonb,              -- {neck:{x,y}, shoulder_l:{x,y}, ...} in coordinate 0..1
  updated_at timestamptz not null default now()
);

-- Capi
create table garments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  name text not null,
  category garment_category not null,
  zone body_zone not null,
  color text,                       -- hex dominante
  tags text[] not null default '{}',
  image_path text not null,         -- storage: garments/<user_id>/<id>.png (scontornato)
  original_path text,               -- foto originale, opzionale
  source text check (source in ('camera', 'gallery', 'web')),
  layer_rank smallint not null default 1, -- ordine z default nel busto (1 maglia … 4 cappotto)
  fit_scale numeric(4,2) not null default 1.00,
  fit_offset_x numeric(5,3) not null default 0,
  fit_offset_y numeric(5,3) not null default 0,
  created_at timestamptz not null default now()
);
create index garments_user_category on garments (user_id, category);

-- Modi di indossare un capo (migrazione 006): foto indossata e livello "Su di me" per ciascuno
create table garment_wears (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  garment_id uuid not null references garments on delete cascade,
  name text not null,
  fit_photo_path text,              -- foto indossata (bucket garments), facoltativa
  on_me_path text,                  -- livello "Su di me" (bucket renders)
  on_me_body text,                  -- foto del corpo con cui è stato generato
  created_at timestamptz not null default now()
);
create index garment_wears_garment on garment_wears (garment_id);

-- Outfit salvati
create table outfits (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  name text not null,
  style outfit_style not null default 'casual',
  is_favorite boolean not null default true,
  snapshot_path text,               -- PNG del camerino
  render_path text,                 -- risultato "provalo su di me"
  avatar_mode avatar_mode not null,
  created_at timestamptz not null default now()
);

create table outfit_items (
  outfit_id uuid not null references outfits on delete cascade,
  garment_id uuid not null references garments on delete cascade,
  zone body_zone not null,
  layer smallint not null default 1,  -- 1..3 per il busto
  wear_id uuid references garment_wears on delete set null, -- modo di indossarlo (migrazione 006)
  primary key (outfit_id, garment_id)
);

-- Job di virtual try-on
create table tryon_jobs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  outfit_id uuid not null references outfits on delete cascade,
  status text not null default 'queued' check (status in ('queued','running','done','error')),
  provider text,
  error text,
  result_path text,
  created_at timestamptz not null default now(),
  finished_at timestamptz
);

-- RLS
alter table profiles enable row level security;
alter table garments enable row level security;
alter table outfits enable row level security;
alter table outfit_items enable row level security;
alter table garment_wears enable row level security;
alter table tryon_jobs enable row level security;

create policy "own profile" on profiles for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "own garments" on garments for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "own garment wears" on garment_wears for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "own outfits" on outfits for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "own outfit items" on outfit_items for all
  using (exists (select 1 from outfits o where o.id = outfit_id and o.user_id = auth.uid()))
  with check (exists (select 1 from outfits o where o.id = outfit_id and o.user_id = auth.uid()));
create policy "own tryon jobs" on tryon_jobs for select
  using (user_id = auth.uid());
-- inserimenti/aggiornamenti di tryon_jobs solo dalla Edge Function (service role)

-- Storage: bucket privati garments, body, renders.
-- Policy: ogni utente legge/scrive solo nella cartella <user_id>/
create policy "own files read" on storage.objects for select
  using (bucket_id in ('garments','body','renders') and (storage.foldername(name))[1] = auth.uid()::text);
create policy "own files write" on storage.objects for insert
  with check (bucket_id in ('garments','body') and (storage.foldername(name))[1] = auth.uid()::text);
create policy "own files delete" on storage.objects for delete
  using (bucket_id in ('garments','body','renders') and (storage.foldername(name))[1] = auth.uid()::text);
