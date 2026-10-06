# Web Comic Reader

Browser-based reader for CBR, CBZ, and CBT files, with collections and reading progress.

## Features

- **Collections** - Saved folder entries with covers, comic counts, progress, and connection status
- **Reading Progress** - Saves your last page and scrolls to it when you reopen
- **Thumbnails** - Generated from comic pages
- **Recently Read** - Lists your last 5 comics with progress
- **Quick Read** - Opens individual files without saving progress
- **Client-Side Processing** - Files are read in your browser without uploading
- **Local Reading** - Comics are processed locally; external UI dependencies need internet access unless cached by your browser

## Usage

### Language and Notifications

Use the header language selector to choose **EN** (English) or **TR** (Türkçe). English is the default. The choice is saved separately from library data (`comic_reader_language`) and applies to labels, messages, relative times, confirmations, and reader controls. Changing language keeps the current comic and reading position. Folder names and filenames are displayed as stored on disk.

App notifications appear in a dismissible message panel. Collection removal, rediscovery, and root replacement use in-app confirmation dialogs; Cancel or Escape leaves the action unapplied. Native filesystem pickers and browser/OS permission prompts remain under browser control and may use the system language. If browser storage is blocked, the language choice applies only to the current session.

### Library Mode
1. Click **Select Comics Folder** and select the root folder
2. Each direct child folder becomes a collection
3. Open a collection card to browse its comics, thumbnails, and Recently Read list
4. Click a comic to read; its last page and thumbnail are saved automatically
5. Use **All Collections** to return to the library

Only comics **directly inside each direct child folder** are listed. Loose comics in the root and comics in deeper nested folders are ignored; loose files can still be opened with Quick Read. Add another child folder on disk and reselect the root (or reload with persistent permission) to discover another collection.

Cards remember their name, comic list/count, cover, started/finished counts, known reading progress, and last-read comic/page/time. Covers are generated from the first comic when possible, with a placeholder until an image is available. Progress bars use known page counts from comics you have opened; unread comics have unknown page counts. A comic is counted as finished when its final page is viewed.

### Removing Collections

Use **Remove collection** on a card or inside a collection. Confirm to remove its saved comic list, progress, last-read information, and thumbnails from this browser. **Folders and comic files are never deleted or modified.** Cancel or press Escape to keep the entry.

Removed folder names are excluded from future scans, reloads, and reconnects, whether their folders are present or missing. Exclusions use child-folder names across root changes. If another saved entry uses the same name, it remains available to reconnect.

**Rediscover removed** includes excluded names in the next root scan or reconnect. They return without their previous history or thumbnails. Other collections and the root connection are unchanged. If browser storage rejects a removal, the entry is kept.

### Reconnecting the Root Folder

The app remembers one root comics folder. With `showDirectoryPicker`, its handle is saved in IndexedDB. On startup permission is checked without prompting; a permitted root restores all collections automatically. Native pickers receive the old root handle as a `startIn` hint and the stable `comics-root` picker `id`. The browser controls the starting location and permission prompts; no raw filesystem paths are stored or exposed.

Browsers without that picker (including Brave configurations that disable it) use a `webkitdirectory` input. The collections remain remembered, but file access ends on reload or restart. Click **Reconnect [root name]** and select the parent folder once: all discovered collections reconnect together with their existing history and thumbnails. Inside a collection, **Reconnect root** performs the same operation and returns to that collection. **Choose root folder** reselects or relocates the parent and refreshes its contents.

Directory inputs cannot specify an initial location. Select the named root folder. Canceling or denying permission keeps saved collections and history. Choosing a different root asks for confirmation; matching child-folder names retain history, and missing collections remain saved as **Not found in root**. Restore their folders and rescan the root to recover access. Folder names identify collections after migration, so renaming a child folder generally creates a new entry; the old history remains in the unavailable card.

Reading history uses **collection ID + comic filename**, so identical filenames in different collections have independent progress. Reconnection preserves IDs. Upstream’s saved `comicsFolder` handle identifies its previous single-folder library during the first root scan, by native handle identity where available or folder name. Its history and thumbnails from `comic_reader_userpref` are kept. Without that handle, filename history is imported only when the filename matches exactly one discovered collection; ambiguous history remains in the original storage. The original handle and history key remain intact. Migration supports upstream’s single-folder data, not intermediate development schemas.

### Quick Read Mode
1. Click "Quick Read"
2. Select or drop a CBR, CBZ, or CBT file
3. Read without saving progress

## Getting Started (Development)

### Prerequisites
- A local web server (Python's `http.server`, Node's `http-server`, etc.)
- For persistent Library Mode: HTTPS or a trustworthy local origin such as `localhost`

### Basic Setup (HTTP)
```bash
# Clone or download the repository
git clone <repository-url>
cd Web-Comic-Reader

# Start a local server (choose one):
# Python 3
python -m http.server 8000

# Python 2
python -m SimpleHTTPServer 8000

# Node.js http-server
npx http-server -p 8000

# PHP
php -S localhost:8000
```

Visit `http://localhost:8000` in your browser. Library Mode uses the persistent picker when available, otherwise a session folder input. Quick Read is also available.

### HTTPS Setup (For Persistent Library Mode)

Persistent folder access requires a secure context (HTTPS or a trustworthy local origin such as `localhost`). Session folder selection does not require HTTPS:

**Option 1: nginx-proxy**
1. Set up nginx-proxy with SSL certificates
2. Configure proxy to your local server
3. Access via `https://yourdomain.test`

**Option 2: mkcert**
```bash
# Install mkcert
# macOS
brew install mkcert

# Create local CA
mkcert -install

# Generate certificate
mkcert localhost 127.0.0.1

# Use with your server (example with http-server)
npx http-server -p 8000 -S -C localhost+1.pem -K localhost+1-key.pem
```

### File Structure
```
├── index.html              # Main HTML file
├── assets/
│   ├── css/
│   │   └── styles.css     # All styles and theming
│   └── js/
│       ├── script.js      # Main application logic
│       ├── i18n.js        # English/Turkish app strings
│       └── uncompress/
│           └── uncompress.js  # Archive extraction
├── README.md
└── LICENSE
```

### Development Notes
- Collection metadata, manifests, reading history, and thumbnails are stored in `localStorage` (key: `comic_reader_libraries`, version 3)
- Removed child-folder names are stored as `removedFolders` in the same metadata; no filesystem write permission or deletion APIs are used
- The persistent root handle is stored in `IndexedDB` (database: `ComicReaderDB`, store: `directories`, key: `comicsRoot`)
- Session `File` objects remain in memory; folder/file contents are not persisted
- The legacy `comic_reader_userpref` key and `comicsFolder` handle are retained for migration
- Thumbnails are base64-encoded JPEG stored in localStorage
- Uses vanilla JavaScript (no jQuery required)
- English/Turkish app strings are defined in `assets/js/i18n.js`; raw archive errors are logged to the console and shown as translated messages

## Requirements

- A browser with `showDirectoryPicker` for persistent Library Mode or `webkitdirectory` input support for session Library Mode
- **Secure context required** for persistent Library Mode (HTTPS or `localhost`)
- For Quick Read Mode, HTTP is sufficient

## Browser Compatibility

### Library Mode (File System Access API)
Desktop browsers with this API include:
- Chrome/Chromium (desktop)
- Microsoft Edge (desktop)
- Opera (desktop)

### Session Library Mode (Directory Input)
Browsers without `showDirectoryPicker`, including Firefox and Safari versions with `webkitdirectory` support, can select a folder for the current session. Folder selection depends on the browser and platform's file picker. The app checks support directly instead of relying on browser names.

Browsers supporting neither folder selection method can view remembered collections and use Quick Read, but cannot select or reconnect a root. Session mode does not store folder handles or full file contents in IndexedDB. Native root scanning can discover empty child directories. A directory input exposes files only, so it cannot discover a completely empty child directory; a child containing non-comic or deeper files is discoverable as an empty collection. Previously remembered empty/missing collections remain visible with their saved metadata. A completely empty root may return no files/change event and leave the current view unchanged. Persistence depends on browser storage being available; clearing site data removes saved libraries/progress, and private browsing or storage limits may prevent persistence. Metadata is local to this browser profile and origin, with no account or cross-device sync.

## Supported Formats

- `.cbr` - Comic Book RAR
- `.cbz` - Comic Book ZIP
- `.cbt` - Comic Book TAR

## Technical Details

- Pure client-side processing (no server required)
- Reading progress stored in localStorage
- Folder handles stored in IndexedDB
- Thumbnails generated using Canvas API
- lightGallery for image viewing with zoom and fullscreen

## Credits

- [Uncompress.js](https://github.com/workhorsy/uncompress.js) - Archive extraction
- [lightGallery](https://github.com/sachinchoolur/lightGallery) - Image gallery and viewer
- [Dropzone.js](https://www.dropzone.dev/) - File upload handling

## License

This project is licensed under the MIT License - see the LICENSE file for details.
