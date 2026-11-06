# Sift — 10-Second Ad: Script & Storyboard

**Format:** 1920×1080 (16:9), 30 fps, 10.0 s
**Mood:** Moving from chaos to calm. Starts dark and cluttered, ends clean, bright, and glowing.
**Core message:** *Sift sorts your messy PC in one click. It's safe, you can undo anything, and it runs 100% on your PC.*

> Live preview: open `preview.html` in Edge or Chrome. It plays this exact storyboard.
> Keyframe stills of each scene are in `frames/`.

---

## Timeline

| # | Time | Scene | On-screen text | Visuals | Motion |
|---|------|-------|----------------|---------|--------|
| 1 | 0.0 – 2.0 s | **The Mess** | Your Downloads folder is a **mess.** | 18 file chips scattered and tilted at random: `IMG_4821.jpg`, `invoice_final(3).pdf`, `setup_v2.3.exe`, `poster_FINAL_v7.psd`, `project.zip`… | Chips pop in fast and staggered (snap ease), then wobble slightly. "mess." is in rose `#fb7185`. |
| 2 | 2.0 – 4.0 s | **Meet Sift** | Meet **Sift.** | The Sift logo (squircle S mark) scales in at center with an indigo glow. | Every chip gets pulled into the logo, shrinking and spinning straight. The logo pulses once at 3.3 s as it "absorbs" them. "Sift" uses the brand gradient. |
| 3 | 4.0 – 6.5 s | **Sorted** | Every file, **sorted** in one click. | 6 folder cards in a 3×2 grid: **Images · Documents · Design · Videos · Archives · Installers**. Each shows a path (`Images/2026/11`) and a file count. | Cards rise in with a stagger. Counters tick from 0 to the final number. |
| 4 | 6.5 – 8.5 s | **Safe** | Safe. Undoable. **100% local.** | 3 feature cards: **4.2 GB freed** (green) · **1-Click Undo** · **Stays local** | Cards slide up with a stagger, and the green number glows. |
| 5 | 8.5 – 10.0 s | **End Card** | **Sift** / PRECISION FILE ORGANIZER / **[ Download for Windows ]** | Logo, wordmark, gradient tagline, purple CTA pill. | Everything settles in. Hold the final frame for at least 0.8 s. |

---

## Voice-over (optional, ~2.5 words/sec)

> **"Messy Downloads? Meet Sift. It sorts every file, clears the junk, and undoes anything in one click. Sift. Tidy your PC."**

| Time | VO line |
|------|---------|
| 0.2 s | "Messy Downloads?" |
| 2.2 s | "Meet Sift." |
| 4.2 s | "It sorts every file," |
| 6.0 s | "clears the junk, and undoes anything in one click." |
| 8.8 s | "Sift. Tidy your PC." |

---

## Sound design

| Time | Cue |
|------|-----|
| 0.0 s | Low, slightly tense synth pad with a soft "clutter" tick for each chip pop |
| 2.0 s | Whoosh / suction as the files get pulled into the logo |
| 3.3 s | Deep bass "thump" and a shimmer on the logo pulse |
| 4.1 s | Bright, upbeat pluck melody starts (the resolution) |
| 4.1 – 5.5 s | Quiet "tick-tick" for each folder card landing |
| 6.6 s | Soft chime on "4.2 GB freed" |
| 8.6 s | Final riser that resolves into a clean logo sting |

---

## Shot rules

- **Background:** Always the dark radial gradient (`#1e2238` → `#111322` → `#090a12`) with slow, blurred cyan, violet, and rose light blobs drifting behind.
- **Headline:** Top-center, white `#f2f2f4`, weight 800, about 104 px at 1080p. The key word in each headline gets the brand gradient.
- **Safe area:** Keep all text 120 px from the left and right edges and 90 px from the top and bottom.
- **Colors:** Use only colors from `brand-tokens.css`. No pure white backgrounds and no off-brand colors.
- **Logo:** Never stretch it, recolor it, or put it on a light background. Use `assets/sift-logo.svg` or `Sift-Logo-Transparent-4K.png`.
