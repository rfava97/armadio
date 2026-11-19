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
- Sotto: chip delle zone (Busto, Gambe, Piedi). La vista è sempre **Su di me**; il **Tavolo** compare solo se nel Profilo manca la tua foto (con il rimando al Profilo).
- Centro: il palco, in una delle due viste (2.3). Ai lati si intravedono il capo precedente e successivo della zona attiva (peek ~16%).
- Riga in basso: senza foto, il rimando al Profilo; su di me lo stato dei capi (pronto, da preparare, in preparazione) con il pulsante "Prepara".

### 2.2 Interazioni
- **Zone**: `busto` (strati), `gambe`, `piedi`. Tap su una zona del palco la rende attiva (alone leggero).
- **Swipe orizzontale** sul palco: scorre i capi della zona attiva, filtrati per categorie compatibili:
  - busto → Maglie, Camicie, Canotte, Felpe e Maglioni, Giacche e Cappotti
  - gambe → Pantaloni, Jeans
  - piedi → Scarpe
- Max 3 strati sul busto, in ordine fisso dall'interno: canotta < maglia < camicia < felpa/maglione < giacca/cappotto. Ogni strato propone (swipe e Cerca) solo i capi più esterni di quello sotto e più interni di quello sopra: niente maglia sopra una felpa, niente due felpe. "+ Strato" aggiunge sopra il capo più vicino tra quelli più esterni e compare solo se ce n'è uno. Un capo arrivato da "Prova nel camerino" va nello strato del suo tipo (sostituisce lo stesso tipo, o si inserisce al suo posto). Gli stati salvati vengono rimessi in ordine (uno per tipo).
- Tap su "Strato N" → rende attivo quello strato; X → rimuove.
- Pulsante "Mescola" (icona shuffle) → combinazione casuale.

### 2.3 Viste del camerino
**A. Tavolo (solo senza la tua foto)**
- I capi scelti, stesi come un outfit su un tavolo: busto in alto, pantaloni sotto, scarpe in fondo, con un'ombra morbida. Gli strati interni del busto stanno dietro quello esterno.
- I capi sono in proporzione. Busto: nella foto viene riconosciuto il petto (colonne alte quasi quanto il capo, anche oltre il varco di una giacca aperta) e le spalle (sotto un eventuale cappuccio); il capo è scalato sulla larghezza tipica del petto (maglia ~52 cm, camicia ~54, felpa ~58, giacca ~60) e tutti gli strati sono allineati alle spalle e al centro del petto, uno dietro l'altro (spuntano orli e maniche, come davvero). Se la forma non si riconosce, si usa la lunghezza tipica. Pantaloni ~104 cm di lunghezza, paio di scarpe largo ~30.
- Funziona sempre, anche senza foto e senza connessione all'AI.

**B. Su di me**
- La tua foto a figura intera (Profilo → Avatar in uso) con i capi indossati.
- Ogni maglia e pantalone viene "fotografato su di te" **una volta sola** con il try-on di Hugging Face (2.3 C): dal confronto tra la foto inviata e quella generata si ritaglia il capo (con le braccia ridisegnate) come livello WebP trasparente, salvato nel bucket privato `renders` (`<user_id>/onme/…`). Sul capo: `on_me_path` e `on_me_body` (la foto del corpo usata; se cambi foto, il capo va rifatto).
- Nel camerino i livelli si sovrappongono alla foto (pantaloni, poi strati del busto dal più interno): lo swipe resta istantaneo.
- Capi non ancora pronti: non compaiono, la riga in basso propone "Prepara". Dal Profilo si preparano tutti i capi mancanti in coda (uno alla volta, circa un minuto a capo, una decina al giorno con la quota gratuita).
- **Scarpe** su di te solo con Gemini (FASHN non le veste): nel dettaglio capo, sezione "Su di te" con Sagoma e Importa (prompt dedicato: solo le scarpe ai piedi verdi, viste di fronte come indossate). All'import l'allineamento pesa la zona dei piedi e resta solo ciò che sta sotto le caviglie. Nel camerino le scarpe stanno sotto i pantaloni (un pantalone largo ci ricade sopra); "Prepara" e la coda FASHN le saltano; Regola solo Insieme. Gli accessori non si vedono su di te. Il capo scelto che non si vede addosso (scarpe non ancora importate, accessori, capo non ancora preparato) compare in un riquadro in basso a destra, che segue lo swipe.
- **Come lo indossi** (dettaglio capo, tabella `garment_wears`, migrazione 006): ogni maglia o pantalone ha uno o più *modi* (es. felpa "Chiusa" e "Aperta"; per camicie, felpe e giacche sono suggeriti). Ogni modo ha:
  - una **foto indossata** facoltativa, in cui qualcuno porta il capo così: non compare nell'armadio, serve solo al try-on (FASHN `garment_photo_type: model`, che copia vestibilità e chiusura); senza, si usa la foto stesa (`flat-lay`, capo aderente e chiuso). Ridotta a 1200 px, non scontornata, nel bucket `garments`;
  - il pulsante **Gemini**, che copia un prompt per far creare a Gemini la foto indossata (un modello qualunque con la tua altezza che porta il capo in quel modo; solo la foto del capo va a Google) e apre l'app Gemini;
  - il suo livello "Su di me" con **Prepara** / **Rifai**.
  Un capo senza modi ha il modo implicito "Base" (creato alla prima preparazione o foto). I dati della migrazione 005 diventano il modo "Base".
- **Su di te con Gemini** (in ogni modo, sezione aperta): il modo principale per creare i livelli; FASHN ("Prepara") resta come alternativa. "Sagoma" prepara la tua sagoma (figura verde uniforme con le tue proporzioni e posa, nel fotogramma dei livelli: niente foto né viso) e la foto stesa del capo, copia un prompt e apre la condivisione verso Gemini, che veste la sagoma solo con quel capo e la lascia verde dove non è coperta. "Importa" toglie lo sfondo (stesso scontorno dei capi), allinea tutta la figura alla sagoma (ricerca di scala e spostamento che massimizza la sovrapposizione, con più peso alla zona del capo), toglie il verde, toglie le linee sottili (fino a 4 px) che hanno il vuoto da entrambi i lati (segni che Gemini disegna sul manichino, che resterebbero come righe chiare) e lo salva come livello "Su di me" del modo.
- **Il nome del modo guida la vestibilità** nei prompt di Gemini (`src/lib/wearStyle.ts`): parole chiave combinabili Aperta/Chiusa, Cropped/Corta, Oversize, Baggy/Morbidi/Larghi, Slim/Aderente, Arrotolate; il resto del nome passa come descrizione libera. Nel prompt della sagoma entrano solo nella riga "worn like this" e in una breve nota sulla lunghezza (cropped sopra la vita, pantaloni alla caviglia o morbidi sulle scarpe se baggy): il resto è il testo originale che ha funzionato, perché ogni regola in più fa ridisegnare il manichino a Gemini. Nel prompt della foto indossata ci sono anche regole di taglia riferite al modello. Suggerimenti per tipo di capo (es. maglie: Regular, Cropped, Oversize; pantaloni: Regular, Baggy, Slim).
- Nel camerino, se il capo attivo ha più modi, sotto il palco compaiono i chip per sceglierlo (es. Chiusa | Aperta); la scelta vale per "Su di me" e "Provalo su di me" e viene salvata con l'outfit (`outfit_items.wear_id`). **Capo sopra chiuso**: se un capo del busto è in un modo chiuso (il nome contiene "Chius": Chiusa, Chiusa 3/4), i capi sotto che hanno il modo "Chiusa" pronto si vedono così, qualunque modo sia scelto (una felpa aperta non sta sotto un montone chiuso); i loro altri chip sono disattivati con l'avviso "Il capo sopra è chiuso". La scelta salvata non cambia e torna valida riaprendo il capo sopra.
- **Salva da "Su di me"**: nella vista Su di me il cuore nell'header compone l'immagine come si vede (foto + livelli) e la salva nei preferiti con nome e stile, senza generare di nuovo.
- **Rifai su di me**: dal dettaglio capo o dalla riga sotto il palco, rigenera il capo (sostituisce il livello precedente).
- **Regola**: dalla riga sotto il palco, corregge a mano il capo attivo, con anteprima sulla foto (mentre il dito si muove su una copia piccola, a dito fermo a piena risoluzione). Scheda **Insieme**: Grandezza, Lunghezza (±15%, dal centro in alto del capo: colletto o elastico), Su/giù, Sinistra/destra. Scheda **Busto e braccia** (capi del busto): larghezza del busto (dal centro) e di ciascun braccio (dal bordo del busto, i bordi sono le spalle segnate nel Profilo). Scheda **Maniche** (capi del busto): **Inclina** ruota ogni manica attorno alla spalla (−10°…+15°, positivo verso l'esterno) e **Manica** la allunga o accorcia lungo il braccio (spalla → polsino, ±20%) senza ingrossarla; l'effetto cresce piano dalla spalla, così la manica si piega senza strapparsi, e non trascina pezzi di busto. Scheda **Gambe** (pantaloni): larghezza di ciascuna gamba (dal centro) e **Apri**, che inclina la gamba verso l'esterno dal cavallo in giù, per seguire le gambe divaricate della foto. Le parti si deformano riga per riga, senza strappi. **Salva** ridisegna il livello del modo (sostituisce il precedente); **Azzera** e **Annulla** non salvano nulla.
- **Strati coperti**: ogni capo è generato da solo, quindi uno strato sotto (es. maglia sotto una giacca o un maglione) spunterebbe ai lati, nelle ascelle e sulle spalle. Su di me, riga per riga, lo strato sotto si vede solo: nelle righe dove sopra non c'è niente (o solo pezzi stretti sotto il 3% della larghezza: ganci, lacci), cioè l'orlo che esce sotto; sotto i capi sopra (rientrando di 2 px, così sul bordo non traspare); nel vuoto che contiene il centro del corpo (l'apertura di una giacca aperta, lo scollo, tra le maniche sotto l'orlo). Non nei vuoti di lato (ascelle) né oltre le maniche. In più, per colonne: dove c'è un capo sopra, lo strato sotto resta qualche pixel sotto il suo bordo più alto (le spalle oblique di una giacca non lasciano spuntare la maglia), tranne nelle aperture vere vicino al centro (entro il 6% della larghezza per lato): un vuoto con il capo da entrambi i lati, come la V di una zip o uno scollo, dove lo strato sotto si vede sempre. Più in là (es. un vuoto tra colletto e spalla) vale la regola per colonne. Vale anche per l'immagine salvata nei preferiti. Durante lo swipe, su di te, il capo attivo non si sposta ma sbiadisce (la maschera dei capi sopra lo taglierebbe in modo strano). **Cappuccio e collo alto**: solo dello strato subito sotto il più esterno (con un capo in mezzo, es. polo sotto un girocollo sotto la giacca, il colletto della polo resta sotto; se il capo in mezzo ha un collo alto o un cappuccio, spunta il suo). Di quello strato si disegna sopra i capi esterni la parte che sale attorno al collo: la parte alta dello strato finché resta sotto il 60% della sua larghezza alle spalle, solo nelle colonne di quella parte stretta (mai sulle spalle). Se è larga almeno il 15% e sale almeno il 2,5% sopra quella riga è un **cappuccio** (anche abbassato): tirato fuori e steso sul colletto dei capi sopra, fino al 4% dell'altezza sotto il loro bordo alto (ne segue il profilo, ammorbidito su una fascia larga: l'orlo è una curva continua, non i ciuffi di una pelliccia), solo nelle colonne della parte stretta (sulle spalle cappuccio e felpa non si distinguono) e con le estremità arrotondate; mai più del 3% sotto la fine della sua parte stretta, e questo limite è un arco (il 3% al centro, sempre meno verso i lati, su tutta la larghezza) così il bordo non è mai una riga dritta (sulle spalle il bordo dei capi sopra è più in basso e il cappuccio ci scenderebbe come due ali). Se è più stretta ma sale almeno il 3% è un **collo alto** (es. felpa con la zip): sta in piedi attorno al collo, davanti al colletto dei capi sopra. Nelle colonne del collo arriva almeno alla sua base (dove lo strato si allarga oltre un terzo della larghezza del colletto), ma mai oltre il 4% dell'altezza sotto la cima (la base calcolata può finire sul petto) e, dove non c'è bordino, al massimo il 3% sotto il bordo alto dei capi sopra e almeno l'1,2% sotto (sopra uno scollo più basso, come un girocollo, non resta un buco con la pelle); lì il bordo dei capi sopra è ammorbidito su una fascia dell'1,2% della larghezza (niente scalini dove lo scollo scende ripido) e alle estremità, entro il 2,5% della larghezza, il colletto scende sempre meno e si chiude sul bordo dei capi sopra con una curva (esce sopra il loro colletto senza portarsi dietro il davanti della felpa); le punte al massimo al 9%. Il colletto si analizza a piena risoluzione (a 400 px il bordino, largo 1–2 px, sparisce). **Colletto chiuso dal bordino** (felpa con la zip, aperta, 3/4 o chiusa): se il bordino a contrasto chiude il colletto, la sua forma è la zona racchiusa dal bordino, trovata a piena risoluzione partendo dal colletto attorno al collo (riga all'1% sotto la cima, colonne del collo) e allargandosi tra i pixel del capo senza attraversare il bordino, che resta incluso: punte e bavero hanno la stessa forma di quando la felpa si vede intera, senza la spalla sopra il bordino. Solo per un colletto aperto (al centro, al 5% sotto la cima, lo strato è vuoto: zip aperta o a 3/4); un colletto chiuso resta con la regola per colonne. Vale anche quando lo strato sembrerebbe un cappuccio (un colletto molto aperto è largo come un cappuccio). Se la zona arriva al 12% sotto la cima il bordino non chiude il colletto e vale la regola seguente. Le **punte del bavero** aperto si riconoscono dal bordino a contrasto (chiaro e poco colorato) che le contorna: in ogni colonna, fino al 7% più in largo del collo, il colletto arriva fino al pixel di bordino più basso vicino alla cima della colonna (entro l'8% dell'altezza). Una spalla non ha bordino e resta sotto; una scritta colorata non conta. Il bordino deve partire dalla cima della colonna (entro l'1,5% dell'altezza) e scendere senza interruzioni più lunghe del 3%: la cerniera (grigio chiaro) e le scritte chiare sul petto, più in basso e staccate, non contano. Le colonne di lato valgono solo se attaccate al colletto (buchi corti, fino all'1,2% della larghezza, riempiti con la media delle vicine); il bordo basso è una linea continua, quindi ogni colonna prende il più basso tra lei e le vicine entro lo 0,6% della larghezza (niente avvallamenti dove si è trovato solo il bordino di sopra). Senza bordino il colletto esce fino alla sua base, senza punte. Il bordino conta solo se fa contrasto con il capo: in un capo chiaro (es. polo bianca, dove sul petto più del 40% dei pixel è chiaro) è chiaro tutto e il colletto resta quello del collo, senza punte. Altrimenti è un girocollo e resta sotto. Maschera a piena risoluzione, bordo morbido di 2 px. Il bordo basso del cappuccio è una curva unica (media sul 4% della larghezza). **Polo con le righe sul colletto** (capo chiaro, righe scure lungo il bordo delle punte, entro il 7% sotto la cima, per lato solo le colonne entro il 3% dell'altezza dalla riga mediana: ombre e bottoni no): le punte arrivano poco sotto le righe (1,2%), il bordo basso scende dritto dalle righe alla punta della V davanti (la prima riga del capo sotto lo scollo, al centro) e oltre le righe il bordo bianco del colletto (1% della larghezza) risale verso la cima. Così sopra un girocollo si vedono le punte con le righe, come nella polo da sola. **Colletto aperto** senza bordino a contrasto (polo, camicia) sopra un capo con lo scollo più basso (girocollo): tra le punte lo strato è aperto e si vedrebbe il bordo del capo sopra come un triangolo scuro; lì, sopra i capi esterni e sotto il colletto, si rimette la foto del corpo (il collo). Con le punte del bavero a contrasto (felpa con la zip) no: tra le punte resta il colletto dei capi sopra.
- **Esce sotto / Dentro**: sotto il palco, per lo strato attivo che ha capi sopra (su di te). "Esce sotto" (default): lo strato si vede come è stato generato, anche sotto l'orlo dei capi sopra; se è più corto e deve uscire, si allunga con Regola → Lunghezza. "Dentro": lo strato non esce sotto l'orlo dei capi sopra (per colonne, l'orlo più alto tra i capi sopra, cioè quello del capo che lo copre davvero: una maglia dentro una felpa non esce sotto la felpa anche se la giacca sopra è più lunga; nell'apertura di una giacca aperta, dove l'orlo manca o c'è solo la punta del colletto, vale quello dei due lembi accanto; prima la mediana larga così ganci e lacci non contano, poi il riempimento dell'apertura, poi di nuovo la mediana). La scelta è dello stato del camerino (`outfit.inside`) e vale anche per l'immagine salvata. Con "Esce sotto" la fascia che esce sotto l'orlo dei capi sopra è tutta o niente: se lungo il busto (le colonne in cui lo strato arriva vicino all'orlo; le maniche corte non contano) esce in mediana meno del 2,5% dell'altezza è un difetto della generazione (una striscia, o pezzi qua e là) e si nasconde tutta; altrimenti si vede intera, tranne i pezzetti di meno dell'1%. Si misura rispetto all'orlo più basso nei dintorni (5% della larghezza per lato) e si taglia lì: sui fianchi l'orlo dei capi sopra risale con il loro bordo, e uno strato sotto appena più largo (una polo sotto un girocollo) spunterebbe a pezzetti ai lati; nell'apertura di una giacca con i lembi a altezze diverse non si fanno scalini.
- **Colletto fuori / dentro** (o **Cappuccio fuori / dentro**): sotto il palco, accanto a Esce sotto / Dentro, per lo strato attivo coperto che ha un cappuccio o un collo alto. "Fuori" (default): si tira fuori sopra i capi esterni come descritto sopra. "Dentro": resta sotto i capi sopra come il resto dello strato. Stato del camerino (`outfit.collarIn`), vale anche per l'immagine salvata.

**C. "Provalo su di me" (AI, gratis con limiti)**
- Pulsante con le scintille nell'header del camerino: genera una foto realistica dell'outfit sulla foto del corpo.
- Edge Function `tryon` → modello open source di virtual try-on ospitato su Hugging Face (ZeroGPU, gratuito): FASHN VTON 1.5 (Apache-2.0, modalità "flat-lay") e, se non risponde, Leffa (MIT).
- Prima lo strato più esterno del busto, poi i pantaloni sulla foto già vestita (due generazioni).
- Quota gratuita: pochi minuti di GPU al giorno (circa 5 con un account HF gratuito, meno senza). 20–60 s per generazione.
- Privacy: foto del corpo e dei capi vengono inviate a Hugging Face; l'interfaccia lo dice prima di generare.
- Il risultato si può salvare come immagine e nei preferiti.
- FASHN e Leffa girano a 50 passaggi (il massimo): più lenti, risultato più fedele.

**D. Collegamento a Gemini**
- Nel foglio "Provalo su di me", sotto "Genera": "Apri Gemini" copia negli appunti un prompt in inglese con l'outfit (strati del busto dal più interno, pantaloni, scarpe; cosa mantenere uguale della persona) e apre l'app Gemini. Nessuna API e nessuna foto inviata dall'app: le allega l'utente.
- Provata la versione con condivisione delle foto e import del risultato: risultato troppo artificiale e flusso macchinoso, quindi tolta.

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
