# Web Comic Reader

Modern web-based comic book reader for CBR, CBZ, and CBT files with library management and reading progress tracking.

## Features

- **Modern UI** 
- **Library Mode** - Select your comics folder once, access anytime with persistent folder access
- **Collections** - Each folder of comics becomes a collection with a cover, comic count and reading progress
- **Reading Progress** - Automatically saves your last read page and scrolls to it when you reopen
- **Thumbnail Previews** - Auto-generated cover thumbnails for quick comic recognition
- **Recently Read** - Quick access to your last 5 comics with progress indicators
- **Quick Read Mode** - Upload and read individual files without library setup
- **Client-Side Only** - All processing happens in your browser, no server uploads required
- **Offline Support** - Works completely offline after initial load

## Usage

### Library Mode (Recommended)
1. Click "Select Comics Folder"
2. Choose your comics folder and grant permission
3. Open a collection to browse its comics, thumbnails and Recently Read list
4. Click any comic to read
5. Your progress is automatically saved

#### Collections
The folder you select is the root. Comics directly inside it form a collection named after the root, and each folder inside it becomes its own collection:

```
Comics/                  <- select this folder
├── One-Shot.cbz         -> collection "Comics"
├── Saga/                -> collection "Saga"
│   ├── Saga 01.cbz
│   └── Saga 02.cbz
└── Watchmen/            -> collection "Watchmen"
    └── Watchmen.cbr
```

Folders deeper than one level are not scanned. To pick up new comics or folders, reselect the root (or reload, if the browser kept permission).

- **Remove collection** forgets a collection's comic list, progress and thumbnails in this browser. Files and folders on disk are never changed or deleted. Removed folders are skipped in future scans until you click **Rediscover removed**, which brings them back without their old history.
- If you upgrade from the single-folder version, select the same folder as before. Its comics become a collection and your reading history is kept.

#### Reconnecting
In Chrome, Edge and Opera the root folder is remembered and restored on reload when permission is still granted; otherwise click **Reconnect**. Other browsers can select a folder for the current session only, so after a reload you select the root again. Collections and reading history are kept either way.

### Quick Read Mode
1. Click "Quick Read"
2. Upload a single CBR/CBZ/CBT file
3. Read immediately (progress won't be saved)

## Getting Started (Development)

### Prerequisites
- A local web server (Python's `http.server`, Node's `http-server`, etc.)
- For persistent Library Mode: HTTPS, or `localhost`

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

Visit `http://localhost:8000` in your browser. On other HTTP hosts, Library Mode only works for the current session (see Browser Compatibility).

### HTTPS Setup (For Persistent Library Mode)

Remembering the folder across reloads needs a secure context: HTTPS, or `localhost`:

**Option 1: Using nginx-proxy (Recommended for local development)**
1. Set up nginx-proxy with SSL certificates
2. Configure proxy to your local server
3. Access via `https://yourdomain.test`

**Option 2: Using mkcert for local HTTPS**
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
│       └── uncompress/
│           └── uncompress.js  # Archive extraction
├── README.md
└── LICENSE
```

### Development Notes
- Collections, reading progress and thumbnails are stored in `localStorage` (key: `comic_reader_libraries`)
- The root folder handle is stored in `IndexedDB` (database: `ComicReaderDB`, key: `comicsRoot`)
- The old `comic_reader_userpref` history and `comicsFolder` handle are read once to migrate single-folder libraries, and left in place
- Thumbnails are base64-encoded JPEG stored in localStorage
- Uses vanilla JavaScript (no jQuery required)

## Requirements

- Chrome, Edge or Opera for a remembered Library Mode folder; other browsers with folder selection get session-only Library Mode
- **HTTPS (or `localhost`) required** for the remembered folder
- For Quick Read Mode, HTTP is sufficient

## Browser Compatibility

### Library Mode (File System Access API)
**✅ Fully Supported:**
- Chrome/Chromium (desktop)
- Microsoft Edge (desktop)
- Opera (desktop)

**⚠️ Session only (folder must be reselected after reload):**
- Firefox and Safari (desktop), using the browser's folder picker. Collections and reading progress are still saved.

**❌ No folder selection:**
- Browsers without any folder picker (e.g. most mobile browsers) can only use Quick Read.

## Supported Formats

- `.cbr` - Comic Book RAR
- `.cbz` - Comic Book ZIP
- `.cbt` - Comic Book TAR

## Technical Details

- Pure client-side processing (no server required)
- Reading progress stored in localStorage
- Root folder handle stored in IndexedDB
- Thumbnails generated using Canvas API
- lightGallery for image viewing with zoom and fullscreen

## Credits

- [Uncompress.js](https://github.com/workhorsy/uncompress.js) - Archive extraction
- [lightGallery](https://github.com/sachinchoolur/lightGallery) - Image gallery and viewer
- [Dropzone.js](https://www.dropzone.dev/) - File upload handling

## License

This project is licensed under the MIT License - see the LICENSE file for details.
