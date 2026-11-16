# Armadio — Roadmap (fase a costo zero)

Una fase alla volta. A fine fase: build ok, lint ok, checklist spuntata, commit, e fermati per la revisione di Riccardo.
Vincolo trasversale: costo zero (vedi CLAUDE.md).

## Fase 0 — Setup
- Progetto Vite + React + TS + Tailwind + shadcn, PWA (manifest, icone, `display: standalone`), React Router con 3 tab vuote e bottom bar.
- Client Supabase, login con magic link, route protette.
- Applicare `supabase/schema.sql`, creare bucket privati `garments`, `body`.
- Token di DESIGN.md come CSS variables + config Tailwind.
- Deploy su GitHub Pages via GitHub Actions.
- Workflow keep-alive (SPEC 5b).
- ✅ Accetto se: app installabile su iPhone da "Aggiungi a Home", login funziona, 3 tab navigabili, keep-alive eseguito con successo una volta a mano.

## Fase 1 — Armadio + riconoscimento automatico
- Lista capi con tab categorie, griglia, ricerca, dettaglio, modifica, eliminazione.
- Aggiungi capo: Scatta foto, Galleria/PNG pronto, rilevamento trasparenza, scontornatura in browser con anteprima prima/dopo, ritaglio al soggetto.
- Riconoscimento in browser (CLIP zero-shot) + colore dominante → form precompilato.
- Compressione WebP + miniatura.
- ✅ Accetto se: aggiungo 5 capi reali dal telefono (3 foto, 2 PNG già scontornati); almeno 4 su 5 hanno categoria corretta senza correzioni; ogni capo pesa < 200 KB; i capi restano dopo aver chiuso e riaperto l'app.

## Fase 2 — Cerca online
- Sheet "Cerca su internet", apertura Google Immagini, "Incolla immagine" da appunti, Edge Function `fetch-image` per URL, fallback campo link.
- ✅ Accetto se: importo una giacca trovata su Google in meno di 30 secondi.

## Fase 3 — Profilo e manichino
- Sheet "Personalizza le misure" con slider e manichino SVG parametrico live; salvataggio su `profiles`.
- Card "La tua foto / Manichino" con selezione; upload foto corpo + calibrazione ancoraggi.
- ✅ Accetto se: cambiare altezza/spalle/vita modifica visibilmente il manichino; la foto calibrata mostra i 7 marcatori nei punti giusti.

## Fase 4 — Camerino
- Avatar + capi sovrapposti per zona con ancoraggi; swipe con peek laterale; tap per zona attiva; long-press e "+ Strato"; indicatori strati; Mescola; regolazione vestibilità per capo.
- ✅ Accetto se: compongo Henley nera + felpa + pantaloni neri in < 15 s, lo swipe è fluido su iPhone, la felpa copre correttamente la maglia.

## Fase 5 — Outfit preferiti
- Snapshot outfit, sheet "Salva nei tuoi preferiti" con nome e stile, toast, carosello nel Profilo, riapertura nel camerino, statistiche e "capi mai usati", export/import backup.
- ✅ Accetto se: salvo 3 outfit e li ritrovo nel Profilo; riaprendoli il camerino si ricompone uguale; l'export ZIP si reimporta su un account vuoto.

## Fase 6 — Stilista
- Outfit del giorno con meteo Open-Meteo + motore a regole.
- (Opzionale) "Chiedi allo stilista" con Gemini free tier, solo testo.
- ✅ Accetto se: per 5 mattine le 3 proposte sono indossabili per il meteo del giorno e almeno una mi convince.

## Fase 7 — Rifinitura
- Stati vuoti, errori offline, dark mode, icone app definitive.

## Dopo (solo se si decide di spendere)
- "Provalo su di me" con API di virtual try-on a pagamento.
