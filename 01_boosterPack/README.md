# 01 · Booster Pack

Anteprima 3D live di un booster pack (busta flow-pack con sigilli zigrinati e lembo sul retro).
Apri `index.html` con un doppio click: funziona offline, three.js è incluso in `vendor/`.

| File | Contenuto |
|---|---|
| `index.html` | il tool |
| `boosterPack.js` | geometria, shader del materiale, interazioni |
| `boosterPack.css` | UI (stesso stile delle sticker-tools) |
| `vendor/three.bundle.js` | three.js r169 + RoomEnvironment, impacchettato come script classico |
| `artwork/` | artwork precaricati, assegnati agli slot in base al nome del file (vedi *Artwork precaricati*) |
| `artwork.js` | gli artwork di `artwork/` incorporati in base64 — generato da `build-artwork.sh` |
| `build-artwork.sh` | rigenera `artwork.js` dopo aver aggiunto/cambiato immagini in `artwork/` |

---

## Le immagini da caricare

Tutte le misure partono dalle dimensioni del pack impostate in **Pack shape** (default **72 × 128 mm**; preset forma: gonfiore 2.6 mm, crimp 5.5 mm, transizione 5.5 mm, passo zigrinatura 1.75 mm, denti 1 mm, rilievo 98%, grinze 200%, lembo 9 mm piegato su B e sollevato di 7°)
e da una densità consigliata di **16 px/mm (≈ 406 dpi)**. Se cambi le dimensioni del pack, ogni slot
del pannello mostra la nuova misura consigliata; il pulsante **Template** scarica un PNG già della misura giusta,
con le zone disegnate sopra.

Formula: `pixel = millimetri × 16`

### Layout di default — sigilli sopra e sotto, lembo verticale

```
        FRONTE                       RETRO (visto da dietro)
  ┌───────────────────┐         ┌─────────┬─────────┐
  │░░░░ crimp 5.5mm ░░│         │░░░░░░░░░│░░░░░░░░░│  ← crimp
  │                   │         │         ║▓▓       │
  │                   │         │ metà A  ║▓▓ metà B│  ║ = attacco del lembo
  │      1152 ×       │         │  576 ×  ║▓▓  576 ×│  ▓ = coperto dal lembo (9 mm)
  │      2048 px      │         │  2048   ║▓▓  2048 │
  │                   │         │         ║▓▓       │
  │░░░░ crimp 5.5mm ░░│         │░░░░░░░░░│░░░░░░░░░│  ← crimp
  └───────────────────┘         └─────────┴─────────┘
```

| Slot | Area sul pack | Dimensione consigliata | Rapporto |
|---|---|---|---|
| **Front** | tutta la faccia: 72 × 128 mm | **1152 × 2048 px** | 9 : 16 |
| **Back · half A** (sinistra) | metà sinistra del retro: 36 × 128 mm | **576 × 2048 px** | 9 : 32 |
| **Back · half B** (destra) | metà destra del retro: 36 × 128 mm | **576 × 2048 px** | 9 : 32 |
| **Flap** (opzionale) | il lembo: 9 × 128 mm | **144 × 2048 px** | 9 : 128 |

### Layout alternativo — sigilli ai lati, lembo orizzontale (come la busta Ice Age del reference)

Seleziona *Seals → Crimps left + right*. Il retro si divide in **metà superiore (A)** e **metà inferiore (B)**,
con il lembo orizzontale al centro. Con un pack di 128 × 72 mm (larghezza × altezza):

| Slot | Area | Dimensione consigliata |
|---|---|---|
| **Front** | 128 × 72 mm | **2048 × 1152 px** |
| **Back · half A** (sopra) | 128 × 36 mm | **2048 × 576 px** |
| **Back · half B** (sotto) | 128 × 36 mm | **2048 × 576 px** |
| **Flap** | 128 × 9 mm | **2048 × 144 px** |

In questo layout i crimp sono a **sinistra e a destra** di ogni immagine.

### Zone da rispettare in ogni immagine

| Zona | Misura (default) | Cosa succede |
|---|---|---|
| **Crimp** (alle estremità lungo i sigilli) | 5.5 mm = **88 px** | la stampa c'è, ma è schiacciata e zigrinata; l'ultimo 1 mm (16 px) è tagliato a dente di sega |
| **Transizione** dopo il crimp | ~5.5 mm | la busta si gonfia e fa le grinze: evita testi piccoli |
| **Margine laterale** | 3 mm = **48 px** | i bordi curvano verso il retro, la grafica si vede di scorcio |
| **Coperto dal lembo** | 9 mm = **144 px** dal centro del retro | nella metà dove si piega il lembo (default: B, a sinistra dell'immagine B) |

Con **Show guides** (tasto **G**) le stesse zone compaiono direttamente sul pack in 3D.

### Formato

- **PNG** (8 bit, RGB o RGBA) o JPG. Profilo sRGB.
- **Trasparenza:** dove l'immagine è trasparente si vede il **film del pack** (metallizzato, foil o opaco).
  Le zone semi-trasparenti mescolano stampa e materiale. È il modo per lasciare "a vista" il metallizzato, come nelle buste Pokémon del reference.
- Se le proporzioni non coincidono con quelle consigliate lo slot lo segnala in arancione. *Fit artwork* sceglie come adattarla: **Stretch** (deforma), **Cover** (riempie e taglia), **Contain** (tutta visibile, il resto mostra il materiale).
- Il pulsante **Height from the front image proportions** adatta l'altezza del pack all'immagine del fronte.

### Modalità dell'artwork (per ogni slot)

Una volta caricata un'immagine, sotto lo slot compare la scelta della modalità:

| Modalità | Cosa fa |
|---|---|
| **Full colour** | l'immagine viene stampata con i suoi colori invariati; dove è trasparente si vede il materiale del pack |
| **Alpha → fill** | i colori dell'immagine vengono ignorati: il suo **alpha** diventa la maschera dell'**Artwork fill**, un materiale indipendente da quello del pack che si regola in **Material → Artwork fill** (il blocco compare appena uno slot usa questa modalità). **Invert alpha** (nello slot) inverte la maschera: il riempimento va dove l'immagine è trasparente |

Esempio: *Pack film* Matte bianco + logo in PNG trasparente in *Alpha → fill* con *Artwork fill* = Foil · Holographic liquid → logo olografico su busta opaca.
Per questa modalità servono PNG con canale alpha (le zone opache diventano il riempimento). L'Artwork fill è unico e condiviso da tutti gli slot in Alpha → fill.

### Artwork precaricati

Ogni slot ha un menu **Artwork…** prima di *Load* con gli artwork della cartella `artwork/`, scelti in base al nome del file:

| Slot | Nome del file contiene | Oggi |
|---|---|---|
| Front | `front` | 13 artwork (`pack-Front-Logo-…`, `-Subject-A/B-…`, `-Year-…`) |
| Back · half A | `back-a` | `pack-Back-A` — **caricato di default** all'apertura |
| Back · half B | `back-b` | `pack-Back-B` — **caricato di default** all'apertura |
| Flap | `flap` | `pack-Flap` |

Gli artwork neri su trasparente in *Full colour* si stampano neri, in *Alpha → fill* diventano foil, metallizzato, ecc.
Per aggiungerne o cambiarli: metti i PNG in `artwork/` e lancia `bash build-artwork.sh` (serve perché, aprendo il tool con doppio click, il browser non permette a WebGL di leggere immagini dal disco: vanno incorporate in `artwork.js`).

---

## Materiale

La sezione **Material** ha tre blocchi separati e indipendenti:

| Blocco | Cosa controlla | Materiali |
|---|---|---|
| **Pack film** | la busta stessa: si vede dove l'artwork è trasparente | Metallic · Foil · Matte |
| **Artwork fill** (arancione, solo se uno slot è in *Alpha → fill*) | le forme degli artwork in *Alpha → fill*; indica quali slot lo usano | Ink · Metallic · Foil · Matte |
| **Print & laminate** | ruvidità della stampa *Full colour* e laminato lucido sopra tutto | — |

Ogni blocco ha colore/tinta, ruvidità e *Reset*. Con **Foil** compaiono il menu della texture e i suoi parametri:
dimensione del pattern, densità, rilievo, variazione di colore con l'angolo e *Shuffle pattern*.

### Texture foil

| Foil | Ispirato a | Aspetto |
|---|---|---|
| **Chromatic (iridescent)** | H5010 / H5050 | metallizzato a specchio che cambia colore in modo morbido inclinando il pack |
| **Holographic liquid** | reference "pool party" | bande fluide con linee neon arcobaleno |
| **Glitter sparkle** | H5020 / H5070 | puntini olografici che si accendono a seconda dell'angolo (densità = puntini più fitti) |
| **Shattered prism (cracked ice)** | H5030 / H5250 | sfaccettature irregolari, ognuna riflette e colora in modo diverso |
| **Wave lines** | H5210 | onde parallele argento/arcobaleno |
| **Starburst** | H5090 | raggiere caleidoscopiche ripetute (densità = numero di raggi) |
| **Pixel mosaic** | H5130 | griglia di quadratini olografici |

Scegliendo una texture si caricano dimensione e densità adatte; poi si regolano liberamente.

## Texture del materiale (filigrane, foil, olografico…)

Fino a **4 texture** aggiuntive, sopra l'artwork. Ogni texture è una **maschera**: bianco/opaco = effetto attivo, nero/trasparente = nessun effetto.

| Effetto | Uso tipico |
|---|---|
| **Metallic foil** | hot-stamping argento/oro su loghi e scritte (colore = tinta della lamina) |
| **Holographic foil (liquid)** | foil olografico liquido solo dove c'è la maschera |
| **Rainbow sheen (smooth)** | riflesso arcobaleno morbido che cambia con l'angolo di vista |
| **Emboss** | rilievo (bianco = in rilievo; *Invert* per il debossing) |
| **Spot gloss varnish** | vernice lucida UV selettiva |
| **Matte varnish** | vernice opaca selettiva |
| **Ink tint / watermark** | filigrana o motivo tono su tono stampato |

Per ogni texture: faccia (Front / Back / Both), intensità, colore, canale della maschera (**alpha** per PNG trasparenti, **luminance** per immagini in bianco e nero, scelto in automatico), inversione, e **Repeat as a pattern** per ripetere un piccolo modulo (es. 256 × 256 px) su tutta la faccia.

Dimensioni delle maschere:
- **a faccia intera**: stesse misure della faccia (fronte 1152 × 2048 px; retro = **tutto il retro**, 1152 × 2048 px, non le due metà);
- **a pattern**: qualunque modulo, meglio se quadrato e ripetibile senza giunture (256–1024 px).

## Forma del pack

Larghezza/altezza in mm, gonfiore, profondità del crimp, transizione crimp → corpo, passo della zigrinatura, profondità dei denti, rilievo della zigrinatura, grinze. Lembo: larghezza, lato su cui si piega (metà A o B), **apertura** (lo solleva come quando si apre la busta) e superficie (materiale non stampato, continuazione dell'artwork del retro, oppure immagine dedicata).

## Interazione

| | |
|---|---|
| **Hover** | il pack si inclina verso il puntatore |
| **Click** sul pack / **F** / **Spazio** | gira il pack (fronte ⇄ retro) |
| **Rotella** | zoom · doppio click: reset vista |
| **G** | guide on/off |
| Trascina un'immagine sul pack | va sulla faccia visibile (sul retro: alla metà sotto il puntatore) |

## Esportazione e progetti

- **Export PNG**: screenshot ad alta risoluzione della vista corrente (anche con sfondo trasparente).
- **All templates**: scarica i template PNG di tutti gli slot alle misure correnti.
- **Save / Open project**: file `.json` con impostazioni e immagini incluse. Si può anche trascinare il `.json` sul pack.
- Le impostazioni (non le immagini) restano salvate nel browser tra una sessione e l'altra.

## Note tecniche

- Unità: 1 unità three.js = 1 mm. Geometria generata proceduralmente: superficie a cuscino (superellisse) con transizione liscia verso i crimp, bordi laterali chiusi, lembo incernierato al centro del retro.
- Shader: `MeshPhysicalMaterial` esteso (`onBeforeCompile`). Composizione con alpha premoltiplicato, rilievi procedurali (zigrinatura, grinze, pattern dei foil) e maschere degli effetti. Il taglio a dente di sega è antialiasato con alpha-to-coverage.
- Luce: ambiente "studio" con softbox (riflessi netti sul metallizzato) oppure `RoomEnvironment`; tone mapping *Neutral* per mantenere fedeli i colori della stampa.
- Per aggiornare three.js: `npm i three esbuild` poi
  `npx esbuild entry.js --bundle --format=iife --global-name=THREE --minify --outfile=vendor/three.bundle.js`
  con `entry.js` = `export * from 'three'; export { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';`

## Esempi

`esempi/` contiene immagini di prova alle misure di default: fronte con finestra trasparente (mostra il materiale),
le due metà del retro, una maschera per il foil e un modulo a stelle da usare come pattern (es. olografico, *Repeat as a pattern*).
