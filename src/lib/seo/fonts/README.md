# Fonts for the share image

Static cuts of the brand kit's two typefaces, for the share image only (`../shareImage.tsx`, served at `/og/<slug>`). The image library, `next/og` (which wraps satori), reads TTF, OTF and WOFF files and one weight per file; it cannot read the kit's own files, which are WOFF2 and variable. The site's pages do not use these files: they load the kit's fonts through `src/app/fonts.ts`.

| File                                          | Cut from                                           | Axes pinned                  | Sets                                                                                                                                                                                       |
| --------------------------------------------- | -------------------------------------------------- | ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `fraunces-latin-opsz144-wght500.ttf`          | `src/brand/fonts/fraunces-latin-opsz-normal.woff2` | optical size 144, weight 500 | The page's title: a display heading as the kit sets one (`h1` in `src/brand/css/03-components.css`: `--iiic-weight-medium`, `"opsz" 144`)                                                  |
| `manrope-latin-wght800.ttf`                   | `src/brand/fonts/manrope-latin-wght-normal.woff2`  | weight 800                   | The kicker (`.iiic-kicker`: `--iiic-weight-black`; `.s-kicker` in the kit's social template: 800)                                                                                          |
| `manrope-latin-wght600.ttf`                   | `src/brand/fonts/manrope-latin-wght-normal.woff2`  | weight 600                   | The city line (`.s-foot` in the kit's social template: 600)                                                                                                                                |
| `fraunces-latin-opsz144-wght500.metrics.json` | `fraunces-latin-opsz144-wght500.ttf`               | —                            | The characters that font holds, each with its advance width. The image drops what the font cannot draw, so the library never fetches a font or an emoji, and sizes a title so that it fits |

Each file holds the same 200-odd Latin characters as its source, the rupee sign included.

## Rebuilding

Rebuild when the kit's font files change, or when the kit changes the weight or optical size of its headings or labels. The tool is [fonttools](https://github.com/fonttools/fonttools), with `brotli` to read WOFF2. These commands, run from the repository root in bash, made the files (fonttools 4.68.0, brotli 1.2.1, Python 3.13):

```sh
python -m pip install fonttools==4.68.0 brotli==1.2.1
T=$(mktemp -d)
fonttools ttLib.woff2 decompress -o "$T/fraunces.ttf" src/brand/fonts/fraunces-latin-opsz-normal.woff2
fonttools ttLib.woff2 decompress -o "$T/manrope.ttf" src/brand/fonts/manrope-latin-wght-normal.woff2
fonttools varLib.instancer "$T/fraunces.ttf" opsz=144 wght=500 --no-recalc-timestamp -o src/lib/seo/fonts/fraunces-latin-opsz144-wght500.ttf
fonttools varLib.instancer "$T/manrope.ttf" wght=800 --update-name-table --no-recalc-timestamp -o src/lib/seo/fonts/manrope-latin-wght800.ttf
fonttools varLib.instancer "$T/manrope.ttf" wght=600 --update-name-table --no-recalc-timestamp -o src/lib/seo/fonts/manrope-latin-wght600.ttf
python src/lib/seo/fonts/metrics.py
pnpm exec prettier --write src/lib/seo/fonts
```

The first two commands unpack the WOFF2 files, because the instancer writes a file in the format it was given. `--no-recalc-timestamp` keeps the source's dates, so the same versions of the tools give the same bytes:

| File                                 | SHA-256                                                            |
| ------------------------------------ | ------------------------------------------------------------------ |
| `fraunces-latin-opsz144-wght500.ttf` | `0a5fbe7a4fa331800afe31548dc461318a329a9cf64b02d640da6592cd1de6b6` |
| `manrope-latin-wght800.ttf`          | `a16c3078ee693a1875459d346a9e999e8ef1c8463b8f1e377944976f019a6f0d` |
| `manrope-latin-wght600.ttf`          | `ffd419103d4bf747518018a29df68f53c59344d9b9d6055742a62bc12775e812` |

Fraunces is cut without `--update-name-table`: the option names the cut from the source's style table, which has no entry for weight 500, and fails. Its name table therefore still reads "Fraunces 9pt Black", the source's default; the file is optical size 144, weight 500, as its name here says. Nothing reads that table: the image names its fonts itself.

After a rebuild, run `pnpm exec vitest run tests/unit/seoShareImage.spec.tsx` and look at an image (`/og/home`).

## Licence

Fraunces (copyright 2020 The Fraunces Project Authors) and Manrope (copyright 2019 The Manrope Project Authors) are under the SIL Open Font License 1.1, which allows modified versions to be bundled and redistributed with software. The licence texts are `src/brand/fonts/LICENSE-Fraunces.txt` and `src/brand/fonts/LICENSE-Manrope.txt`; each cut keeps the copyright notice and the licence statement in its name table. Neither licence declares a Reserved Font Name, so the cuts keep the family names. They are not sold or offered on their own.
