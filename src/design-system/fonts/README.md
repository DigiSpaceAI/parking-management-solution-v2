# ParkFlows fonts (self-hosted)

All three families are licensed under the SIL Open Font License 1.1. Each folder holds its licence as `OFL.txt`. They were downloaded once from the official OFL releases on 3 Oct 2026 (002 tech design T2). There is no Google Fonts request and no npm font package.

| Family | Weights | Source (official OFL release) | What we ship |
|---|---|---|---|
| Sora | 600, 700 | `google/fonts` `ofl/sora/Sora[wght].ttf`: the OFL distribution of the Sora Project (upstream `sora-xor/sora-font`, commit `7f9a9c5` per Google's METADATA). sha256 of the variable TTF: `84ff7096ae3ec6c8be47d906d1a0ba4de7f2ce78c615275c77301964a316e16c` | Static instances at wght 600 and 700 (fontTools `instancer`), subset to Latin + punctuation + arrows, WOFF2 |
| IBM Plex Sans | 400, 500, 600 | `IBM/plex` release `@ibm/plex-sans@1.1.0`, `ibm-plex-sans.zip` (sha256 `fb365d910566e6d199cc2c15579a7dd9a267128e18431a394ed81f1970c69200`) | **IBM's own** `fonts/split/woff2/IBMPlexSans-{Regular,Medium,SemiBold}-{Latin1,Latin2}.woff2`, **unmodified**. "Plex" is a Reserved Font Name, so we don't make our own subsets. Latin2 carries ₹ and loads only when used (`unicode-range`). |
| JetBrains Mono | 500, 600 | `JetBrains/JetBrainsMono` release `v2.304`, `JetBrainsMono-2.304.zip` (sha256 `6f6376c6ed2960ea8a963cd7387ec9d76e3f629125bc33d1fdcd7eb7012f7bbf`) | `fonts/ttf/JetBrainsMono-{Medium,SemiBold}.ttf` subset to Latin + punctuation + arrows, WOFF2 |

**Subset (Sora, JetBrains Mono).** `pyftsubset` (fontTools 4.62) with `--flavor=woff2 --no-hinting --desubroutinize`:
- Unicode range: `U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+0304, U+0308, U+0329, U+2000-206F, U+20AC, U+20B9, U+2122, U+2190-2193, U+2212, U+2215, U+FEFF, U+FFFD`
- Layout features: `kern, liga, calt, tnum, lnum, case, ccmp, locl, mark, mkmk`

Neither Sora nor JetBrains Mono contains ₹, so the browser draws it from IBM Plex Sans, the next family in every token stack. IBM Plex Sans figures are already fixed-width (tabular).

**Total:** 7 files are used on a normal page (~132 KB: Sora 2, Plex Latin1 3, Mono 2). The 3 Plex Latin2 files (~46 KB) load only on pages that show ₹ or other Latin-2 characters.

To change a weight or add a family, update this table, the files and `../fonts.css` together. The tech design must approve any new family (CLAUDE.md rule 5).
