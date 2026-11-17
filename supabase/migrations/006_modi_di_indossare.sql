-- Modi di indossare un capo (es. felpa "Chiusa" e "Aperta"): ognuno con la sua foto indossata
-- (fatta anche con Gemini) e il suo livello "Su di me". Il camerino sceglie il modo per ogni capo
-- e lo ricorda negli outfit salvati.
-- Esegui nel SQL Editor di Supabase. Si può rieseguire senza danni.

create table if not exists garment_wears (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  garment_id uuid not null references garments on delete cascade,
  name text not null,
  fit_photo_path text,              -- foto indossata (bucket garments), facoltativa
  on_me_path text,                  -- livello "Su di me" (bucket renders)
  on_me_body text,                  -- foto del corpo con cui è stato generato
  created_at timestamptz not null default now()
);
create index if not exists garment_wears_garment on garment_wears (garment_id);
alter table garment_wears enable row level security;
drop policy if exists "own garment wears" on garment_wears;
create policy "own garment wears" on garment_wears for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- quello che c'era già sul capo diventa il suo primo modo, "Base"
insert into garment_wears (user_id, garment_id, name, fit_photo_path, on_me_path, on_me_body)
select g.user_id, g.id, 'Base', g.fit_photo_path, g.on_me_path, g.on_me_body
from garments g
where (g.fit_photo_path is not null or g.on_me_path is not null)
  and not exists (select 1 from garment_wears w where w.garment_id = g.id);

-- negli outfit salvati: con quale modo era indossato il capo
alter table outfit_items add column if not exists wear_id uuid references garment_wears on delete set null;
