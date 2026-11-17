# Armadio — istruzioni per Claude Code

App personale (un solo utente: Riccardo) per catalogare il proprio armadio e provare combinazioni di outfit su un manichino con le sue misure, con generazione opzionale "provalo su di me" tramite API di virtual try-on.

Leggi sempre prima:
- `docs/SPEC.md` — funzionalità e comportamento (fonte di verità)
- `docs/DESIGN.md` — design system e regole UI
- `docs/ROADMAP.md` — fasi; lavora UNA fase alla volta e fermati ai criteri di accettazione
- `supabase/schema.sql` — schema DB + RLS

## VINCOLO: COSTO ZERO
Nessun servizio a pagamento, nessuna carta di credito collegata a nessun account. Prima di introdurre qualunque servizio esterno, verifica che abbia un piano gratuito senza carta e chiedi conferma.
- Hosting: GitHub Pages (gratis).
- Backend: Supabase piano Free (DB 500 MB, Storage 1 GB, pausa dopo 7 giorni di inattività → vedi keep-alive).
- AI di riconoscimento capi e scontornatura: SOLO nel browser (modelli locali), niente API.
- Meteo: Open-Meteo (gratis, senza chiave).
- LLM per la chat stilista: opzionale, solo Gemini API free tier, e solo con dati testuali (mai foto del corpo).
- Collegamento "Apri Gemini" (deciso dall'utente): l'app NON chiama Gemini e non gli manda foto. Copia solo un prompt testuale dell'outfit e apre l'app Gemini; le foto, se vuole, le allega l'utente. L'interfaccia avvisa che le foto vanno a Google.
- Virtual try-on a pagamento: VIETATO in questa fase. Ammesso solo quello gratuito su Hugging Face (Edge Function `tryon`), con avviso privacy nell'interfaccia.

## Stack (non cambiarlo senza chiedere)
- Vite + React 18 + TypeScript (strict)
- Tailwind CSS + componenti shadcn/ui (solo quelli che servono)
- React Router (3 tab: /armadio, /outfit, /profilo)
- TanStack Query per i dati remoti
- Supabase: Postgres, Storage, Auth (magic link email), Edge Functions (Deno)
- PWA: `vite-plugin-pwa`, installabile su iPhone (Aggiungi a Home)
- Scontornatura in browser: `@imgly/background-removal` (caricata in lazy, solo quando serve)
- Riconoscimento categoria in browser: `@huggingface/transformers` (transformers.js) con un modello CLIP per zero-shot image classification, caricato in lazy e messo in cache
- Colore dominante: algoritmo locale (k-means sui pixel non trasparenti), nessuna libreria esterna
- Gesture: `@use-gesture/react` + `framer-motion` per swipe, long-press, transizioni
- Deploy: GitHub Pages (base path configurabile) oppure Vercel/Netlify — chiedi prima di scegliere

## Regole
- Mobile first, viewport 390×844 come riferimento. Testa sempre anche 375px.
- Nessuna chiave segreta nel client. Solo `VITE_SUPABASE_URL` e `VITE_SUPABASE_PUBLISHABLE_KEY` nel frontend. La chiave del try-on vive solo nei secrets delle Edge Functions.
- Tutte le immagini dei capi sono salvate come WebP con trasparenza (qualità 0.85), lato lungo max 1000px, obiettivo < 200 KB per capo, nel bucket privato `garments`. Non salvare l'originale di default (spreca storage del piano Free); solo se l'utente lo chiede. Genera anche una miniatura 400px per la griglia. Le foto del corpo nel bucket privato `body`. Usa URL firmati.
- Ogni tabella ha RLS attiva con `user_id = auth.uid()`.
- Testi UI in italiano.
- Niente emoji come icone: usa `lucide-react`.
- Ogni fase si chiude con: `npm run build` senza errori, `npm run lint` pulito, test manuale descritto in ROADMAP spuntato.
- Prima di aggiungere una dipendenza non elencata, chiedi.
- Commit piccoli, messaggi in italiano, uno per funzionalità.

## Variabili d'ambiente
```
VITE_SUPABASE_URL=
VITE_SUPABASE_PUBLISHABLE_KEY=
# Edge Functions (supabase secrets set ...)
GEMINI_API_KEY=        # opzionale, solo fase Stilista-chat
HF_TOKEN=              # opzionale, token Hugging Face (account gratuito) per "Provalo su di me"
# GitHub Actions secrets (deploy + keep-alive)
SUPABASE_URL=
SUPABASE_PUBLISHABLE_KEY=
```
