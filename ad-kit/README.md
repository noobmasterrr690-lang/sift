# Sift — 10s Ad Kit

Everything you need to make the 10-second Sift ad.

| File | What it is |
|------|------------|
| `01-script-storyboard.md` | Shot-by-shot timeline (0–10 s), voice-over timing, sound cues, shot rules |
| `02-copy.txt` | **All the words**: headlines, labels, file names, VO, alternate headlines, CTAs, feature facts |
| `brand-tokens.css` / `brand-tokens.json` | **Style**: colors, gradients, fonts, radii, motion easings |
| `palette.svg` / `palette.png` | Visual color palette sheet |
| `preview.html` | **The animated 10 s ad.** Open it in Edge or Chrome, press F11 for full screen, and screen-record. Click the stage or press **R** to replay. `?loop` loops it, and `?t=5` freezes on 5.0 s. |
| `frames/` | 1920×1080 PNG keyframe of each of the 5 scenes |
| `assets/` | Logo (SVG, 512 PNG, 4K PNG, 4K transparent PNG) and banner |
| `assets/elements/` | Separate images for editors: background plate, 12 file chips, 6 colored folder icons, 4 feature icons, CTA button |

## Exporting to MP4
1. Open `preview.html?loop` in Edge and press F11.
2. Record it with OBS, Xbox Game Bar (Win+Alt+R), or ShareX at 1920×1080, 30/60 fps.
3. Trim to exactly 10.0 s, then add the VO and music from the storyboard.

Or rebuild it in After Effects, Premiere, CapCut, or Canva. Use `assets/elements/` for the images, `02-copy.txt` for the words, and `brand-tokens.json` for the colors.

