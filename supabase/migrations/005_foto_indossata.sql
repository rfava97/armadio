-- Foto indossata di un capo: non compare nell'armadio, serve solo a "Su di me" e "Provalo su di me"
-- per copiare vestibilità e chiusura (oversize, giacca aperta…). Nel bucket garments:
-- <user_id>/<garment_id>_indossata-<n>.webp
-- Esegui nel SQL Editor di Supabase. Si può rieseguire senza danni.
alter table garments add column if not exists fit_photo_path text;
-- (la colonna photo_type della migrazione 004 non è più usata dall'app)
