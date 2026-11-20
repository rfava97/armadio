-- Categoria "Gilet" (busto, tra felpe/maglioni e giacche/cappotti): senza maniche, sotto si vedono
-- le maniche del capo che c'è sotto.
-- Esegui una volta nel SQL Editor di Supabase.
alter type garment_category add value if not exists 'gilet' after 'felpe_maglioni';
