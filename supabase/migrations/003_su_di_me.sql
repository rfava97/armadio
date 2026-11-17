-- Camerino "Su di me": per ogni capo una foto di te che lo indossi, generata una volta sola.
-- Esegui nel SQL Editor di Supabase. Si può rieseguire senza danni.

-- percorso del livello nel bucket renders (<user_id>/onme/<garment_id>-<n>.webp)
alter table garments add column if not exists on_me_path text;
-- foto del corpo con cui è stato generato: se cambi foto, il capo va rigenerato
alter table garments add column if not exists on_me_body text;
