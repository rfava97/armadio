-- Bucket privati per le immagini (Fase 0). Esegui DOPO schema.sql.
insert into storage.buckets (id, name, public)
values
  ('garments', 'garments', false),
  ('body', 'body', false),
  ('renders', 'renders', false)
on conflict (id) do nothing;

-- scrittura nel bucket renders (immagini di "Provalo su di me" salvate nei preferiti)
create policy "own renders write" on storage.objects for insert
  with check (bucket_id = 'renders' and (storage.foldername(name))[1] = auth.uid()::text);
