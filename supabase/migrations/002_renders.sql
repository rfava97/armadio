-- Fase 4 → 5 (anticipata): salvare tra i preferiti l'outfit generato con "Provalo su di me".
-- Esegui nel SQL Editor di Supabase. Si può rieseguire senza danni.

-- bucket privato per le immagini generate
insert into storage.buckets (id, name, public)
values ('renders', 'renders', false)
on conflict (id) do nothing;

-- ogni utente scrive solo nella propria cartella <user_id>/ (lettura e cancellazione sono già in schema.sql)
drop policy if exists "own renders write" on storage.objects;
create policy "own renders write" on storage.objects for insert
  with check (bucket_id = 'renders' and (storage.foldername(name))[1] = auth.uid()::text);
