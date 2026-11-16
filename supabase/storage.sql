-- Bucket privati per le immagini (Fase 0). Esegui DOPO schema.sql.
insert into storage.buckets (id, name, public)
values
  ('garments', 'garments', false),
  ('body', 'body', false)
on conflict (id) do nothing;
