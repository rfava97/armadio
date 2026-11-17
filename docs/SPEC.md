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
- Header: "Crea il tuo outfit", a destra pill con lente (cerca capo), scintille ("Provalo su di me", 2.3 C) e mescola.
- Indicatori strati in alto, solo per la zona busto: `Strato 1: <nome capo>` · `Strato 2: –` con X per rimuovere; lo strato attivo ha sottolineatura accent. Pulsante "+ Strato".
- Sotto: chip delle zone (Busto, Gambe, Piedi) e, a destra, la scelta della vista **Tavolo | Su di me** (ricordata sul dispositivo).
- Centro: il palco, in una delle due viste (2.3). Ai lati si intravedono il capo precedente e successivo della zona attiva (peek ~16%).
- Riga in basso: suggerimento sul tavolo; "su di me" lo stato dei capi (pronto, da preparare, in preparazione) con il pulsante "Prepara".

### 2.2 Interazioni
- **Zone**: `busto` (strati), `gambe`, `piedi`. Tap su una zona del palco la rende attiva (alone leggero).
- **Swipe orizzontale** sul palco: scorre i capi della zona attiva, filtrati per categorie compatibili:
  - busto → Maglie, Camicie, Canotte, Felpe e Maglioni, Giacche e Cappotti
  - gambe → Pantaloni, Jeans
  - piedi → Scarpe
- Max 3 strati sul busto. Ordine z: canotta/maglia < camicia < felpa/maglione < giacca/cappotto.
- Tap su "Strato N" → rende attivo quello strato; X → rimuove.
- Pulsante "Mescola" (icona shuffle) → combinazione casuale.

### 2.3 Viste del camerino
**A. Tavolo (default)**
- I capi scelti, stesi come un outfit su un tavolo: busto in alto, pantaloni sotto, scarpe in fondo, con un'ombra morbida. Gli strati interni del busto spuntano dietro quello esterno.
- I capi sono in proporzione: ogni foto è scalata sulla lunghezza tipica della categoria (maglia ~70 cm, camicia ~78, pantalone ~104, paio di scarpe largo ~30).
- Funziona sempre, anche senza foto e senza connessione all'AI.

**B. Su di me**
- La tua foto a figura intera (Profilo → Avatar in uso) con i capi indossati.
- Ogni maglia e pantalone viene "fotografato su di te" **una volta sola** con il try-on di Hugging Face (2.3 C): dal confronto tra la foto inviata e quella generata si ritaglia il capo (con le braccia ridisegnate) come livello WebP trasparente, salvato nel bucket privato `renders` (`<user_id>/onme/…`). Sul capo: `on_me_path` e `on_me_body` (la foto del corpo usata; se cambi foto, il capo va rifatto).
- Nel camerino i livelli si sovrappongono alla foto (pantaloni, poi strati del busto dal più interno): lo swipe resta istantaneo.
- Capi non ancora pronti: non compaiono, la riga in basso propone "Prepara". Dal Profilo si preparano tutti i capi mancanti in coda (uno alla volta, circa un minuto a capo, una decina al giorno con la quota gratuita).
- Scarpe e accessori non si vedono su di te: restano quelli della foto.
- **Foto del capo: Stesa | Indossata** (dettaglio capo, colonna `photo_type`, migrazione 004). "Stesa" = capo appoggiato o appeso: il modello lo veste aderente e chiuso. "Indossata" = nella foto qualcuno lo porta: il modello ne copia vestibilità e chiusura (oversize, giacca o camicia aperta). Vale anche per "Provalo su di me" (FASHN `garment_photo_type` flat-lay / model).
- **Rifai su di me**: dal dettaglio capo o dalla riga sotto il palco, rigenera il capo (sostituisce il livello precedente).

**C. "Provalo su di me" (AI, gratis con limiti)**
- Pulsante con le scintille nell'header del camerino: genera una foto realistica dell'outfit sulla foto del corpo.
- Edge Function `tryon` → modello open source di virtual try-on ospitato su Hugging Face (ZeroGPU, gratuito): FASHN VTON 1.5 (Apache-2.0, modalità "flat-lay") e, se non risponde, Leffa (MIT).
- Prima lo strato più esterno del busto, poi i pantaloni sulla foto già vestita (due generazioni).
- Quota gratuita: pochi minuti di GPU al giorno (circa 5 con un account HF gratuito, meno senza). 20–60 s per generazione.
- Privacy: foto del corpo e dei capi vengono inviate a Hugging Face; l'interfaccia lo dice prima di generare.
- Il risultato si può salvare come immagine e nei preferiti.

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
- `tryon` — input `{ person, garment, category, photoType }` (immagini in base64, category `tops`|`bottoms`, photoType `flat-lay`|`model`); chiama un modello di try-on su Hugging Face (vedi 2.3 C) con il token `HF_TOKEN` (facoltativo, account gratuito) e restituisce l'immagine. Solo utenti autenticati.

## 5b. Keep-alive (piano Free)
I progetti Supabase gratuiti vanno in pausa dopo 7 giorni senza attività. Aggiungere `.github/workflows/keepalive.yml`: GitHub Action con cron ogni 3 giorni che fa una SELECT leggera su `garments` tramite REST con la publishable key (secrets del repo). Gratis.

## 6. Fuori scope (v1)
Social, condivisione pubblica, più utenti, suggerimenti AI automatici di abbinamento, meteo. Annotarli come idee in `docs/IDEAS.md` se emergono.
