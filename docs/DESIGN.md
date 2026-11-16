# Armadio — Design system

Direzione: **"atelier"**. Avorio caldo, testi blu navy, un solo accento bordeaux, fondi champagne per i capi. Titoli in serif sartoriale, piccoli dettagli da armadio (asta appendiabiti sopra la griglia, sopratitoli in maiuscoletto spaziato). I capi restano le cose più colorate sullo schermo. Palette scelta da Riccardo: **Bordeaux `#641E32`, Champagne `#E8D8C5`, Blu navy `#0B1F44`**.

## Colori (token semantici → CSS variables)
| Token | Valore | Uso |
|---|---|---|
| `--bg` | `#FAF6F0` | sfondo app (avorio) |
| `--surface` | `#FFFDF9` | card, sheet, bottom bar |
| `--surface-muted` | `#F3EADF` | input, chip non selezionate |
| `--garment-bg` | `#EFE3D4` | fondo immagini capi e avatar (champagne chiaro) |
| `--fg` | `#0B1F44` | testo principale (navy) |
| `--fg-muted` | `#5B6275` | categorie, hint (contrasto ≥ 4.5:1 su `--bg`) |
| `--border` | `#E8D8C5` | divisori, bordi card (champagne) |
| `--accent` | `#641E32` | CTA, tab attiva, selezioni, sopratitoli (bordeaux) |
| `--accent-soft` | `#F1E1E2` | fondi tenui legati all'accento |
| `--on-accent` | `#FAF6F0` | testo su accent e su navy |
| `--navy` | `#0B1F44` | voce attiva della bottom bar, etichette dei marcatori |
| `--champagne` | `#E8D8C5` | asta appendiabiti, binario degli slider |
| `--like` | `#8E2440` | cuore preferiti |
| `--danger` | `#A8231C` | elimina, errori |
| `--overlay` / `--toast` | navy 55% / 92% | fuori dal ritaglio, toast |
| `--mannequin` | `#EDE2D4` con ombre `#D6C3AB` | manichino SVG |

Dark mode: fase successiva (non in v1), ma usa solo token, mai hex nei componenti.

## Tipografia
- Titoli: **Cormorant Garamond** (variable, `font-display`), con numeri allineati (`lining-nums`).
- Testo: **Inter** (variable), fallback `-apple-system, system-ui`.
- Titoli schermata: 36/40, 600, Cormorant, tracking −0.01em. Sopra, sopratitolo "ATELIER PERSONALE".
- Titoli sheet: 30/34, 600, Cormorant.
- Sopratitoli e intestazioni di sezione (`text-overline`): 12/16, 600, maiuscolo, tracking 0.12em, `--accent`.
- Label campi: 13/16, 500, `--fg-muted`.
- Corpo: 16/24, 400. Nome capo nelle card: Cormorant 19/24, 600. Categoria: overline 12px muted.
- Minimo assoluto 12px.
- Le dimensioni personalizzate vanno registrate in `cn()` (`src/lib/utils.ts`), altrimenti tailwind-merge le confonde con i colori.

## Spaziatura e forme
- Scala: 4, 8, 12, 16, 20, 24, 32, 48.
- Margine laterale schermata: 20px. Gap griglia: 12px.
- Raggi: card 20px, sheet 28px (solo angoli superiori), chip e pill 999px, input 14px.
- Ombre: quasi assenti, tinte di navy. Card: `0 1px 2px rgba(11,31,68,.05)`. Bottom bar e FAB: `0 10px 30px rgba(11,31,68,.12)`.

## Componenti chiave
- **Bottom bar**: pill flottante `--surface` con bordo champagne, 3 voci (icona + label); voce attiva con capsula `--navy` e testo avorio, icona piena. Rispetta safe area in basso.
- **Tab categorie**: testo 16/500, attiva in `--accent` con sottolineatura 2px che scorre animata tra le tab.
- **Asta appendiabiti**: sotto le tab categorie, barra sottile champagne con i due supporti alle estremità.
- **Card capo**: immagine 4:5 su `--garment-bg`, `object-fit: contain`, margine 12px, dimensione fissa; sotto nome (serif) + categoria (overline).
- **Chip**: altezza 36px, padding 16px; non selezionata `--surface-muted` + testo `--fg`; selezionata `--accent` + testo bianco.
- **CTA primaria**: altezza 56px, piena larghezza, pill, `--accent`.
- **CTA secondaria**: stessa forma, `--surface` con bordo `--border`, icona accent ("Cerca su Google").
- **Bottom sheet**: maniglia 36×5px in alto, titolo grande, contenuto scrollabile, CTA fissa in basso.
- **Toast**: pill `--toast` (navy), testo avorio 15/500, centrato sopra la bottom bar, 2 s.
- **Slider misure**: binario champagne 4px, parte piena bordeaux, cursore avorio 28px con bordo bordeaux.
- **Manichino**: SVG parametrico in `--mannequin` con sfumatura laterale (volume), su fondo `--garment-bg`.
- **Indicatori strati**: label piccola muted ("Strato 1") + nome capo 18/500; strato attivo con sottolineatura accent 2px; X accent per rimuovere.

## Movimento
- Swipe capi: spring (stiffness 300, damping 30); capo uscente scala a 0.92 e sfuma, entrante viceversa.
- Long-press: anello accent che si riempie in 500 ms attorno al dito, poi "pop" (scale 1→1.06→1) del nuovo strato.
- Sheet: slide-up 280 ms ease-out, chiusura 200 ms.
- Rispetta `prefers-reduced-motion`: solo dissolvenze.

## Accessibilità
- Target touch ≥ 44×44.
- Ogni pulsante solo-icona ha `aria-label` (es. "Aggiungi capo", "Cerca", "Salva nei preferiti").
- Swipe sempre affiancato da alternative a tap (frecce visibili sui lati dell'avatar su desktop; i capi in peek sono toccabili).
- Immagini capi: `alt` = nome del capo.
