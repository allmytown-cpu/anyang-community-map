# AGENTS.md

## What this repo is

Static HTML prototypes for community mapping around Anyang, Korea (안양시). No build system, bundler, or package manager — just browser-openable HTML files.

## Files

| File | Purpose |
|---|---|
| `index.html` | **Main map** (GitHub Pages). Reads GPS waypoints from Excel via SheetJS at runtime. Route polyline, numbered markers. |
| `upload-test.html` | Experimental version: photo upload, EXIF GPS extraction, manual click-to-place, persistence via `window.storage`. Firebase backend TBD. |
| `community_mapping_photo_list.xlsx` | Source Excel data (serial numbers, GPS coords, timestamps). |
| `README.md` | Project description (Korean). |

## Dependencies (CDN, no install needed)

- **Leaflet 1.9.4** — mapping library (both files)
- **SheetJS 0.18.5** — Excel parsing in browser (`index.html` only)

## Key technical details

- **Map center**: `37.3948, 126.9134` (Anyang-si, Gyeonggi-do), zoom 16
- **Language**: Korean (`lang="ko"`, UI strings in Korean)
- **Image handling**: Resized to max 1000px, JPEG quality 0.7 before storage
- **Storage**: `upload-test.html` uses `window.storage` (Netlify Blobs or similar) with keys `photo_index` (JSON array of IDs) and `photo:{id}` (JSON records). If this API is unavailable, the upload flow will fail silently.

## How to run

Open either `.html` file directly in a browser. No server required for the prototype (read-only). The upload version needs a runtime that provides `window.storage`.

## Gotchas

- The Excel file is read at runtime via SheetJS (fetch + XLSX.read). If you update the Excel, changes will appear automatically on next page load.
- No linting, typechecking, or test suite exists. There are no scripts to run.
- `window.storage` is not a standard browser API — it's platform-specific. Don't assume it works outside its target hosting environment.
