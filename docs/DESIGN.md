# Armadio — Design system

Direzione: **"atelier pulito"**. Bianco caldo, nero quasi puro, un solo accento blu elettrico (come nel riferimento), molto spazio, i capi sono le uniche cose colorate sullo schermo. Sensazione iOS nativa, niente decorazioni.

## Colori (token semantici → CSS variables)
| Token | Valore | Uso |
|---|---|---|
| `--bg` | `#F7F7F5` | sfondo app |
| `--surface` | `#FFFFFF` | card, sheet |
| `--surface-muted` | `#EFEFEC` | fondo immagini capi, input |
| `--fg` | `#111111` | testo principale |
| `--fg-muted` | `#6B6B6B` | categorie, hint (contrasto ≥ 4.5:1 su `--bg`) |
| `--border` | `#E6E6E2` | divisori, card |
| `--accent` | `#1F5BFF` | CTA, tab attiva, selezioni, strato attivo |
| `--on-accent` | `#FFFFFF` | testo su accent |
| `--like` | `#F2394B` | cuore preferiti |
| `--danger` | `#D92D20` | elimina |
| `--mannequin` | `#E9E9E6` con ombre `#D5D5D0` | manichino SVG |

Dark mode: fase successiva (non in v1), ma usa solo token, mai hex nei componenti.

## Tipografia
- Font: **Inter** (variable), fallback `-apple-system, system-ui`.
- Titoli schermata: 30/34, weight 800, tracking −0.02em ("Il tuo armadio", "Crea il tuo outfit").
- Titoli sheet: 24/28, 800.
- Label campi: 13/16, 500, `--fg-muted`.
- Corpo: 16/24, 400. Nome capo nelle card: 15/20, 500. Categoria: 13/18, 400 muted.
- Minimo assoluto 12px.

## Spaziatura e forme
- Scala: 4, 8, 12, 16, 20, 24, 32, 48.
- Margine laterale schermata: 20px. Gap griglia: 12px.
- Raggi: card 20px, sheet 28px (solo angoli superiori), chip e pill 999px, input 14px.
- Ombre: quasi assenti. Card: `0 1px 2px rgba(0,0,0,.04)`. Bottom bar e FAB: `0 8px 24px rgba(0,0,0,.08)`.

## Componenti chiave
- **Bottom bar**: pill flottante bianca con 3 voci (icona + label); voce attiva con capsula `--surface-muted` dietro e icona piena. Rispetta safe area in basso.
- **Tab categorie**: testo 16/500, attiva in `--accent` con sottolineatura 2px che scorre animata tra le tab.
- **Card capo**: immagine 4:5 su `--surface-muted`, `object-fit: contain`, padding 12px; sotto nome + categoria.
- **Chip**: altezza 36px, padding 16px; non selezionata `--surface-muted` + testo `--fg`; selezionata `--accent` + testo bianco.
- **CTA primaria**: altezza 56px, piena larghezza, pill, `--accent`.
- **CTA secondaria**: stessa forma, `--surface` con bordo `--border`, icona accent ("Cerca su Google").
- **Bottom sheet**: maniglia 36×5px in alto, titolo grande, contenuto scrollabile, CTA fissa in basso.
- **Toast**: pill scura `rgba(17,17,17,.85)`, testo bianco 15/500, centrato sopra la bottom bar, 2 s.
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
