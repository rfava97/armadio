-- Tipo di foto del capo, per "Su di me" e "Provalo su di me":
-- 'stesa' (capo appoggiato o appeso) o 'indossata' (qualcuno lo porta: il modello ne copia
-- vestibilità e chiusura, es. oversize o giacca aperta).
-- Esegui nel SQL Editor di Supabase. Si può rieseguire senza danni.
alter table garments add column if not exists photo_type text not null default 'stesa';
alter table garments drop constraint if exists garments_photo_type_check;
alter table garments add constraint garments_photo_type_check check (photo_type in ('stesa', 'indossata'));
