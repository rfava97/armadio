# Armadio — Specifica funzionale

Utente unico. Lingua: italiano. Piattaforma: PWA su iPhone (Safari), usabile anche da desktop.

Navigazione: bottom bar con 3 tab → **Armadio** (icona gruccia) · **Outfit** (icona maglietta) · **Profilo** (icona persona).

---

## 1. Armadio (`/armadio`)

### 1.1 Lista capi
- Header: titolo "Il tuo armadio", pulsante cerca (icona lente), pulsante "+" primario (circolare, accent).
- Tab categorie scorrevoli orizzontalmente, con indicatore sottolineato sotto la tab attiva:
  `Tutto · Maglie · Camicie · Canotte · Felpe e Maglioni · Giacche e Cappotti · Pantaloni · Jeans · Scarpe · Accessori`
- Griglia a 2 colonne di card: immagine scontornata su fondo grigio chiarissimo, nome del capo, categoria in grigio.
- Ricerca: filtra per nome, colore, tag (client-side).
- Tap su card → dettaglio capo (bottom sheet): immagine grande, nome, categoria, colore, tag, "Prova nel camerino", "Modifica", "Elimina" (con conferma).
- Stato vuoto: illustrazione semplice + "Aggiungi il tuo primo capo".

### 1.2 Aggiungi un capo (bottom sheet "Aggiungi un capo")
Tre sorgenti:
1. **Scatta foto** — apre fotocamera (`<input type="file" accept="image/*" capture="environment">`). Mostra overlay con angoli di inquadratura come guida (se si usa una vista camera custom; altrimenti la camera nativa va bene in v1).
2. **Galleria / PNG pronto** — scelta da libreria foto. Supporta più immagini selezionate.
3. **Cerca online** — vedi 1.3.

Poi, per ogni immagine:
- **Rilevamento trasparenza**: se il PNG ha già alfa significativo (>5% pixel trasparenti sui bordi), salta la scontornatura.
- Altrimenti **scontornatura automatica** in browser (`@imgly/background-removal`), con loader "Sto ritagliando il capo…". Prima esecuzione: avvisa che scarica il modello (~decine di MB) una volta sola.
- **Anteprima prima/dopo** con toggle; opzione "Usa originale" se il ritaglio è sbagliato; opzione "Riprova".
- Ritaglio automatico al bounding box del soggetto + padding 4%.
- **Riconoscimento automatico (gratis, nel browser)**: dopo il ritaglio, un modello CLIP locale classifica il capo (zero-shot) tra le categorie dell'app e attributi utili: maniche lunghe/corte, con cappuccio, jeans/eleganti/tuta, formalità (casual/elegante/sport), stagione (caldo/freddo). Il colore dominante viene estratto dai pixel. Il nome viene composto da questi dati (es. "Felpa con cappuccio verde oliva"). Tutto precompilato, l'utente conferma o corregge con un tap. Se la confidenza è bassa (< 0.5), la categoria resta vuota e va scelta.
- Form: **Nome del capo** (placeholder "Es. Maglia nera"), **Categoria** (chip, selezione singola), **Colore** (chip auto-suggerito dal colore dominante, modificabile), **Tag** (precompilati dal riconoscimento: stagione, formalità; modificabili).
- CTA "Aggiungi all'armadio" (disabilitata finché nome + categoria non ci sono).

### 1.3 Cerca online
Google non si può incorporare in iframe e l'API immagini non serve. Flusso:
- Bottom sheet "Cerca su internet": campo di ricerca → apre `https://www.google.com/search?tbm=isch&q=<query>` in una nuova scheda.
- L'utente tiene premuto sull'immagine → "Copia" (o "Copia indirizzo immagine"), poi torna all'app.
- Nell'app: pulsante **"Incolla immagine"** → `navigator.clipboard.read()` (immagine) oppure, se negli appunti c'è un URL, la Edge Function `fetch-image` scarica l'immagine lato server (evita CORS) e la restituisce.
- Fallback: campo "Incolla link immagine" manuale.
- Poi stesso flusso di 1.2 (scontornatura → form).

---

## 2. Outfit / Camerino (`/outfit`)

### 2.1 Layout
- Header: "Crea il tuo outfit", a destra pill con icona lente (cerca capo) e cuore (salva).
- Indicatori strati in alto, solo per la zona busto: `Strato 1: <nome capo>` · `Strato 2: –` con X per rimuovere; lo strato attivo ha sottolineatura accent.
- Centro: **avatar** a figura intera (manichino o foto, vedi 2.3) con i capi sovrapposti.
- Ai lati dell'avatar si intravedono il capo precedente e successivo della zona attiva (carosello, effetto peek ~15% a sinistra e destra), come nel riferimento.
- Hint in basso, piccolo, grigio: "Tieni premuto per aggiungere uno strato".

### 2.2 Interazioni
- **Zone**: `busto` (strati), `gambe`, `piedi`. Tap su una zona dell'avatar la rende attiva (bordo/alone leggero).
- **Swipe orizzontale** sull'avatar: scorre i capi della zona attiva, filtrati per categorie compatibili:
  - busto → Maglie, Camicie, Canotte, Felpe e Maglioni, Giacche e Cappotti
  - gambe → Pantaloni, Jeans
  - piedi → Scarpe
- **Long-press (500 ms) sul busto** → aggiunge un nuovo strato sopra (es. Henley + felpa), con feedback: anello che si riempie durante la pressione + vibrazione (`navigator.vibrate` dove disponibile). Lo swipe agisce poi sul nuovo strato.
- Pulsante visibile **"+ Strato"** accanto agli indicatori (alternativa al long-press, per la scopribilità).
- Max 3 strati sul busto. Ordine z: canotta/maglia < camicia < felpa/maglione < giacca/cappotto (default; l'utente può invertire con drag sugli indicatori in una fase successiva).
- Tap su "Strato N" → rende attivo quello strato; X → rimuove.
- Pulsante "Mescola" (icona shuffle) → combinazione casuale.

### 2.3 Avatar — due modalità
**A. Manichino (default, tempo reale)**
- Figura SVG parametrica neutra (grigio chiaro, stile manichino bianco), generata dalle misure del Profilo: altezza, peso, spalle, petto, vita, fianchi, lunghezza gambe, forma del corpo (femminile ↔ maschile).
- Valori iniziali: altezza 174 cm, vita 78 cm, fianchi 93 cm; gli altri da stimare e da far correggere all'utente.
- Il manichino espone **punti di ancoraggio**: collo, spalle sx/dx, vita, fianchi, ginocchia, caviglie.
- Ogni capo viene posizionato e scalato in base alla sua zona: un capo del busto si allinea collo → spalle (larghezza = distanza spalle × fattore vestibilità); i pantaloni si allineano vita → caviglie; le scarpe ai piedi.
- **Vestibilità per capo**: nel dettaglio capo, "Regola sul manichino" permette pinch/drag per scalare e spostare; i valori (`fit_scale`, `fit_offset_x`, `fit_offset_y`) vengono salvati sul capo e riusati.

**B. La tua foto (sovrapposizione)**
- L'utente carica una foto a figura intera (frontale, braccia leggermente aperte, sfondo neutro). Scontornata come i capi.
- Calibrazione una tantum: l'utente trascina 7 marcatori (collo, spalle, vita, fianchi, caviglie) sulla foto. Questi diventano gli ancoraggi.
- I capi si sovrappongono come nel manichino (resa 2D approssimata).

**C. "Provalo su di me" (AI) — RIMANDATO**
- Non incluso nella fase a costo zero: non esiste un servizio di virtual try-on gratuito e affidabile.
- Predisporre solo l'interfaccia `TryOnProvider` e il campo `render_path` sull'outfit, senza implementazione e senza pulsante visibile.

### 2.4 Salva outfit (bottom sheet "Salva nei tuoi preferiti")
- Anteprima dell'outfit (snapshot PNG del canvas avatar, generato client-side).
- **Nome dell'outfit** (es. "Weekend").
- **Stile dell'outfit** (chip singola): Casual, Elegante, Sport, Serata, Lavoro, Estate (+ "Altro…").
- CTA "Salva outfit" → toast "Aggiunto ai preferiti".

---

## 3. Profilo (`/profilo`)
- **Avatar in uso**: due card affiancate — "La tua foto" e "Manichino" — quella attiva ha bordo accent e label "In uso"; l'altra "Tocca per selezionare". Pulsante "Cambia foto".
- **Personalizza le misure** (bottom sheet): anteprima del manichino che si aggiorna live + slider: Forma del corpo (Femminile↔Maschile), Altezza (cm), Peso (kg), Spalle (cm), Petto (cm), Vita (cm), Fianchi (cm), Gambe (cm). CTA "Salva misure".
- **I tuoi outfit preferiti**: carosello orizzontale di card (snapshot, nome, stile, cuore rosso). Tap → apre l'outfit nel camerino. Long-press → elimina/rinomina.
- **Statistiche**: numero capi per categoria; "Capi mai usati in un outfit" (lista) — risponde al problema "non ricordo cosa ho".
- **Backup**: "Esporta armadio" (ZIP con PNG + JSON) e "Importa".
- Esci (logout).

---

## 3b. Stilista (sezione in cima alla tab Outfit, o card nel Profilo)

### Outfit del giorno (gratis, senza AI esterna)
- Meteo di oggi per la posizione dell'utente (default Parma) da Open-Meteo: temperatura min/max, pioggia.
- Motore a regole locale che propone 3 outfit dai capi dell'armadio:
  - temperatura → numero di strati e categorie ammesse (es. < 10 °C: maglia + maglione/felpa + giacca; > 24 °C: niente felpe/cappotti);
  - pioggia → preferisci giacche e scarpe adatte (tag);
  - abbinamento colori: al massimo 1 colore "forte" per outfit, gli altri neutri (nero, bianco, grigio, blu navy, beige, oliva); evita due fantasie;
  - formalità coerente tra i capi (tag);
  - penalizza capi usati negli ultimi 3 outfit salvati, premia quelli mai usati.
- Ogni proposta: "Apri nel camerino" / "Altra proposta".

### Chiedi allo stilista (opzionale)
- Campo di testo: "Cena venerdì, elegante ma non troppo".
- Se `GEMINI_API_KEY` è configurata: Edge Function `stylist` manda all'LLM SOLO l'elenco testuale dei capi (id, nome, categoria, colore, tag) e la richiesta; l'LLM risponde con 1–3 combinazioni di id + una frase di motivazione. Nessuna immagine inviata.
- Avviso nell'interfaccia: sul piano gratuito Google può usare i testi inviati per migliorare i suoi prodotti.
- Se la chiave non c'è: la richiesta viene interpretata dal motore a regole (parole chiave: elegante, sport, serata, lavoro, caldo, freddo).

## 4. Dati
Vedi `supabase/schema.sql`. Entità: `profiles` (misure, modalità avatar, foto corpo, ancoraggi), `garments`, `outfits`, `outfit_items`, `tryon_jobs`.

## 5. Edge Functions
- `fetch-image` — input `{ url }`; scarica l'immagine lato server (max 10 MB, solo `image/*`), la restituisce come blob. Solo utenti autenticati.
- `stylist` (opzionale) — input `{ request }`; vedi 3b. Limite: 20 richieste/giorno per rispettare il free tier.
- `tryon` — rimandata.

## 5b. Keep-alive (piano Free)
I progetti Supabase gratuiti vanno in pausa dopo 7 giorni senza attività. Aggiungere `.github/workflows/keepalive.yml`: GitHub Action con cron ogni 3 giorni che fa una SELECT leggera su `garments` tramite REST con la publishable key (secrets del repo). Gratis.

## 6. Fuori scope (v1)
Social, condivisione pubblica, più utenti, suggerimenti AI automatici di abbinamento, meteo. Annotarli come idee in `docs/IDEAS.md` se emergono.
