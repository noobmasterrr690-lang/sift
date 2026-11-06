# Sift — Native PC File Intelligence & Triage Suite

**Sift** is a native Windows desktop app that cleans and organizes files directly on your PC (`Downloads`, `Desktop`, or any folder you pick).

---

## How to Run Sift

Double-click **[`Sift.exe`](./Sift.exe)** in `C:\Users\Kier\Documents\SIFT\Sift.exe`.

---

## Simple 3-Tab Interface

### 1. 📁 Tidy Up
- Automatically sorts loose files into clean folders by type inside the folder they're already in:
  - **Design Files (`Design/{EXT}/`):** `.psd`, `.psb`, `.ai`, `.indd`, `.idml`, `.indt`, `.inx`, `.indb`, `.eps`, `.sketch`, `.fig`, `.xd`, `.afdesign`, `.afphoto`, `.afpub`, `.cdr`, `.xcf`, `.kra`, `.procreate`, `.clip`, `.aep`, `.prproj`, `.drp`, `.fla`, `.drawio`, `.xmp`
  - **Images (`Images/{YYYY}/{MM}/`):** `.jpg`, `.jpeg`, `.jfif`, `.png`, `.webp`, `.heic`, `.heif`, `.gif`, `.bmp`, `.tif`, `.tiff`, `.svg`, `.ico`, `.avif`, `.raw`, `.cr2`, `.cr3`, `.nef`, `.arw`, `.dng`
  - **Documents (`Documents/{EXT}/`):** `.pdf`, `.doc`, `.docx`, `.xls`, `.xlsx`, `.ppt`, `.pptx`, `.txt`, `.md`, `.csv`, `.tsv`, `.rtf`, `.odt`, `.pages`, `.numbers`
  - **Videos (`Videos/{YYYY}/`):** `.mp4`, `.mov`, `.mkv`, `.webm`, `.avi`, `.wmv`, `.flv`, `.m4v`, `.mpg`, `.mpeg`, `.3gp`, `.mts`, `.srt`
  - **Music & Audio (`Audio/`):** `.mp3`, `.wav`, `.flac`, `.aac`, `.m4a`, `.ogg`, `.wma`, `.aiff`, `.opus`, `.mid`
  - **Zip & Archives (`Archives/`):** `.zip`, `.rar`, `.7z`, `.tar.gz`, `.tar`, `.gz`, `.tgz`, `.bz2`, `.xz`
  - **Installers (`Installers/`):** `.exe`, `.msi`, `.dmg`, `.pkg`, `.iso`, `.appx`, `.msix`, `.apk`, `.deb`, `.ipa`
  - **Fonts (`Fonts/`):** `.ttf`, `.otf`, `.woff`, `.woff2`, `.fon`
  - **3D Models (`3D_Models/`):** `.obj`, `.fbx`, `.stl`, `.blend`, `.3ds`, `.dae`, `.glb`, `.gltf`, `.max`, `.c4d`, `.skp`
  - **E-books (`Ebooks/`):** `.epub`, `.mobi`, `.azw`, `.azw3`, `.djvu`
  - **Code & Data (`Code_and_Data/`):** `.json`, `.sql`, `.py`, `.rs`, `.ts`, `.tsx`, `.js`, `.jsx`, `.html`, `.css`, `.yaml`, `.ipynb`, etc.
  - **Other Files (`Other/{EXT}/`):** Any other file type gets its own neat subfolder.
- **Safety First:** If a file with the same name already exists in the destination folder, Sift safely renames it with ` (1)`, ` (2)` instead of overwriting anything.

### 2. 🗑️ Clean Up
- Finds cluttered leftovers you likely don't need:
  - **Unfinished downloads & temp files** (`.crdownload`, `.part`, `.tmp` older than 48 hours)
  - **Exact duplicate files** (bit-for-bit identical files across your folders)
  - **Old installers** (`.exe`, `.msi`, `.iso` untouched for 14+ days)
  - **Old screenshots** (untouched for 30+ days)
  - **Large untouched files** (files > 250 MB not opened in 60+ days)
- Files you select are sent strictly to your **Windows Recycle Bin** (never permanent delete, so you can always restore them).

### 3. ⏪ History & 1-Click Undo
- Keeps a local record of every sort in `C:\Users\Kier\AppData\Local\Sift\sift_journal.db`.
- Hit **Undo** on any batch to immediately move all files back to their exact original locations.
