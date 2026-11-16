-- Fase 1: categoria "Jeans" separata da "Pantaloni" (zona gambe).
-- Esegui una volta nel SQL Editor di Supabase.
alter type garment_category add value if not exists 'jeans' after 'pantaloni';
