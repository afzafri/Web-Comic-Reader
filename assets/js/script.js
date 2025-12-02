document.addEventListener('DOMContentLoaded', () => {

    const outputElement = document.getElementById('output');
    const progressTextElement = document.querySelector('.progress-text');
    const sePreConElement = document.querySelector('.se-pre-con');
    const currYearElement = document.getElementById('currYear');
    const wrapElement = document.querySelector('.wrap');
    const collapseBtn = document.getElementById('collapseBtn');
    const selectFolderBtn = document.getElementById('selectFolderBtn');
    const quickReadBtn = document.getElementById('quickReadBtn');
    const toggleUploadBtn = document.getElementById('toggleUploadBtn');
    const backToLibraryBtn = document.getElementById('backToLibraryBtn');
    const recentComicsEl = document.getElementById('recentComics');
    const recentComicsListEl = document.getElementById('recentComicsList');
    const allComicsEl = document.getElementById('allComics');
    const allComicsListEl = document.getElementById('allComicsList');
    const dividerOrEl = document.getElementById('dividerOr');
    const dropzoneEl = document.getElementById('dropzone');
    const initialViewEl = document.getElementById('initialView');
    const libraryViewEl = document.getElementById('libraryView');
    const quickReadViewEl = document.getElementById('quickReadView');
    const footerCollapsedTextEl = document.getElementById('footerCollapsedText');
    const browserNoticeEl = document.getElementById('browserNotice');

    let comicsDirectoryHandle = null;
    let isLibraryMode = false;

    // current year
    currYearElement.innerHTML = (new Date()).getFullYear();

    // check if File System Access API is supported
    const supportsFileSystemAccess = 'showDirectoryPicker' in window;

    if (supportsFileSystemAccess) {
        selectFolderBtn.style.display = 'flex';
        dividerOrEl.style.display = 'block';
    } else {
        // when API not supported, show notice and make quick read button primary
        browserNoticeEl.style.display = 'block';
        quickReadBtn.classList.remove('folder-btn-secondary');
        quickReadBtn.classList.add('folder-btn-primary');
    }

    // Load all the archive formats
    loadArchiveFormats(['rar', 'zip', 'tar']);

    // click on collapsed footer to expand
    document.querySelector('.footer-collapsed').addEventListener('click', async () => {
        wrapElement.classList.remove('collapsed');
        if (isLibraryMode && comicsDirectoryHandle) {
            // check permission again when expanding
            const permission = await comicsDirectoryHandle.queryPermission({ mode: 'read' });
            if (permission === 'granted') {
                showLibraryMode();
            } else {
                showReconnectButton();
            }
        } else if (!isLibraryMode) {
            showQuickReadMode();
        } else {
            initialViewEl.style.display = 'block';
            libraryViewEl.style.display = 'none';
            quickReadViewEl.style.display = 'none';
        }
    });

    // click collapse button to hide uploader
    collapseBtn.addEventListener('click', (e) => {
        e.preventDefault();
        wrapElement.classList.add('collapsed');
    });

    // select comics folder
    if (selectFolderBtn) {
        selectFolderBtn.addEventListener('click', async () => {
            try {
                // if we already have a handle, try to request permission first
                if (comicsDirectoryHandle) {
                    const permission = await comicsDirectoryHandle.requestPermission({ mode: 'read' });
                    if (permission === 'granted') {
                        await showLibraryMode();
                        return;
                    }
                }

                // show directory picker
                const dirHandle = await window.showDirectoryPicker({
                    mode: 'read'
                });

                // explicitly request persistent permission
                const permission = await dirHandle.requestPermission({ mode: 'read' });
                if (permission !== 'granted') {
                    console.error('Permission not granted');
                    return;
                }

                comicsDirectoryHandle = dirHandle;
                await saveDirectoryHandle(dirHandle);
                await showLibraryMode();
            } catch (err) {
                if (err.name !== 'AbortError') {
                    console.error('Error selecting folder:', err);
                }
            }
        });
    }

    // quick read button
    if (quickReadBtn) {
        quickReadBtn.addEventListener('click', () => {
            showQuickReadMode();
        });
    }

    // toggle upload button
    if (toggleUploadBtn) {
        toggleUploadBtn.addEventListener('click', () => {
            showQuickReadMode();
        });
    }

    // back to library button
    if (backToLibraryBtn) {
        backToLibraryBtn.addEventListener('click', async () => {
            if (comicsDirectoryHandle) {
                const permission = await comicsDirectoryHandle.queryPermission({ mode: 'read' });
                if (permission === 'granted') {
                    await showLibraryMode();
                } else {
                    // need to request permission with user gesture
                    try {
                        const newPermission = await comicsDirectoryHandle.requestPermission({ mode: 'read' });
                        if (newPermission === 'granted') {
                            await showLibraryMode();
                        } else {
                            showReconnectButton();
                        }
                    } catch (err) {
                        console.error('Failed to request permission:', err);
                        showReconnectButton();
                    }
                }
            }
        });
    }

    // load directory handle on startup
    if (supportsFileSystemAccess) {
        loadDirectoryHandle().then(async (result) => {
            if (result.handle && result.hasPermission) {
                comicsDirectoryHandle = result.handle;
                await showLibraryMode();
            } else if (result.handle && !result.hasPermission) {
                // we have a handle but need permission - show button to re-grant
                comicsDirectoryHandle = result.handle;
                showReconnectButton();
            }
        });
    }

    function showReconnectButton() {
        // show initial view with modified button text
        initialViewEl.style.display = 'block';
        libraryViewEl.style.display = 'none';
        quickReadViewEl.style.display = 'none';

        // change button text to indicate reconnection
        const titleEl = selectFolderBtn.querySelector('.btn-title');
        const subtitleEl = selectFolderBtn.querySelector('.btn-subtitle');
        if (titleEl && subtitleEl) {
            titleEl.textContent = 'Reconnect to Comics Folder';
            subtitleEl.textContent = 'Click to restore access to your library';
        }
    }

    async function showLibraryMode() {
        if (!comicsDirectoryHandle) return;

        isLibraryMode = true;
        initialViewEl.style.display = 'none';
        libraryViewEl.style.display = 'block';
        quickReadViewEl.style.display = 'none';
        footerCollapsedTextEl.textContent = 'Show library';

        // reset button text in case it was changed
        const titleEl = selectFolderBtn.querySelector('.btn-title');
        const subtitleEl = selectFolderBtn.querySelector('.btn-subtitle');
        if (titleEl && subtitleEl) {
            titleEl.textContent = 'Select Comics Folder';
            subtitleEl.textContent = 'Auto-track progress, browse all comics';
        }

        await loadRecentComics();
        await loadAllComics();

        if (recentComicsListEl.children.length > 0) {
            recentComicsEl.style.display = 'block';
        }
        allComicsEl.style.display = 'block';
    }

    function showQuickReadMode() {
        isLibraryMode = false;
        initialViewEl.style.display = 'none';
        libraryViewEl.style.display = 'none';
        quickReadViewEl.style.display = 'block';
        footerCollapsedTextEl.textContent = 'Upload another file';

        // reset button text in case it was changed
        const titleEl = selectFolderBtn.querySelector('.btn-title');
        const subtitleEl = selectFolderBtn.querySelector('.btn-subtitle');
        if (titleEl && subtitleEl) {
            titleEl.textContent = 'Select Comics Folder';
            subtitleEl.textContent = 'Auto-track progress, browse all comics';
        }

        // show back to library button only if we have a directory handle
        if (backToLibraryBtn) {
            backToLibraryBtn.style.display = comicsDirectoryHandle ? 'block' : 'none';
        }
    }

    async function loadAllComics() {
        if (!comicsDirectoryHandle) return;

        try {
            // check permission before accessing
            const permission = await comicsDirectoryHandle.queryPermission({ mode: 'read' });
            if (permission !== 'granted') {
                allComicsListEl.innerHTML = '<div style="text-align: center; color: var(--muted); padding: 20px; font-size: 14px;">Permission required to access folder</div>';
                return;
            }

            allComicsListEl.innerHTML = '<div style="text-align: center; padding: 20px;"><div class="spinner" style="margin: 0 auto;"></div><div style="margin-top: 12px; color: var(--muted); font-size: 14px;">Scanning folder...</div></div>';

            const comics = [];
            const validExtensions = ['.cbr', '.cbz', '.cbt'];

            for await (const entry of comicsDirectoryHandle.values()) {
                if (entry.kind === 'file') {
                    const ext = '.' + entry.name.split('.').pop().toLowerCase();
                    if (validExtensions.includes(ext)) {
                        comics.push(entry.name);
                    }
                }
            }

            allComicsListEl.innerHTML = '';

            if (comics.length === 0) {
                allComicsListEl.innerHTML = '<div style="text-align: center; color: var(--muted); padding: 20px; font-size: 14px;">No comics found in this folder. Make sure your comics have .cbr, .cbz, or .cbt extension.</div>';
                return;
            }

            comics.sort();

            // get reading history for thumbnails
            const readingHistory = JSON.parse(localStorage.getItem('comic_reader_userpref') || '{}');

            for (const filename of comics) {
                const comicData = readingHistory[filename];
                const hasThumbnail = comicData?.thumbnail;

                const iconContent = hasThumbnail
                    ? `<img src="${comicData.thumbnail}" alt="" style="width: 100%; height: 100%; object-fit: cover; border-radius: 6px;">`
                    : `<svg viewBox="0 0 16 16">
                        <path d="M3.5 2a1.5 1.5 0 0 0-1.5 1.5v9A1.5 1.5 0 0 0 3.5 14h9a1.5 1.5 0 0 0 1.5-1.5v-9A1.5 1.5 0 0 0 12.5 2h-9zm6.854 6.146a.5.5 0 0 1 0 .708l-3 3a.5.5 0 0 1-.708-.708L8.793 9H5.5a.5.5 0 0 1 0-1h3.293L6.646 5.854a.5.5 0 1 1 .708-.708l3 3z"/>
                    </svg>`;

                const item = document.createElement('div');
                item.className = 'recent-comic-item';
                item.innerHTML = `
                    <div class="recent-comic-icon">
                        ${iconContent}
                    </div>
                    <div class="recent-comic-info">
                        <div class="recent-comic-name">${filename}</div>
                    </div>
                `;
                item.addEventListener('click', () => openComicFromFolder(filename));
                allComicsListEl.appendChild(item);
            }
        } catch (err) {
            console.error('Failed to load all comics:', err);
            
            if (err.name === 'NotFoundError') {
                const folderName = comicsDirectoryHandle ? comicsDirectoryHandle.name : 'directory';
                
                allComicsListEl.innerHTML = '';
                
                const errorWrapper = document.createElement('div');
                errorWrapper.style.textAlign = 'center';
                errorWrapper.style.padding = '40px 20px';
                
                errorWrapper.innerHTML = `
                    <div style="margin-bottom: 10px; color: var(--text);">Failed to load comics from "<strong>${folderName}</strong>"</div>
                    <div style="margin-bottom: 25px; color: var(--muted); font-size: 14px;">The folder might have been moved, renamed, or deleted.</div>
                `;
                
                // Clone the main select button to reuse its exact style
                if (selectFolderBtn) {
                    const btnClone = selectFolderBtn.cloneNode(true);
                    btnClone.id = ''; // Remove ID
                    btnClone.style.display = 'inline-flex';
                    btnClone.style.margin = '0 auto';
                    
                    // Re-attach click handler to trigger original button
                    btnClone.addEventListener('click', () => {
                        selectFolderBtn.click();
                    });
                    
                    errorWrapper.appendChild(btnClone);
                }
                
                allComicsListEl.appendChild(errorWrapper);
                
                // Clear the invalid handle from memory
                comicsDirectoryHandle = null;
            } else {
                allComicsListEl.innerHTML = '<div style="text-align: center; color: var(--muted); padding: 20px; font-size: 14px;">Error loading comics from folder</div>';
            }
        }
    }

    // Dropzone configuration
    if (window.Dropzone) Dropzone.autoDiscover = false;
    let dropzone = new Dropzone("#dropzone", {
        url: '#',
        acceptedFiles: '.cbr,.cbz,.cbt',
        createImageThumbnails: false,
        autoProcessQueue: false,
        previewsContainer: false,
        maxFiles: 1,
        maxfilesexceeded: function(file) {
            this.removeAllFiles();
        },
        init: function () {
            this.on('addedfile', function (file) {
                openComic(file);
            });
        }
    });

    let currentComicFilename = '';
    let lightGalleryInstance = null;
    let hasInitializedGallery = false;

    function openComic(file) {
        outputElement.style.display = 'none';
        wrapElement.classList.add('collapsed');
        collapseBtn.classList.add('show');
        currentComicFilename = file.name;

        // reset gallery initialization flag
        hasInitializedGallery = false;

        // init the gallery plugin, when there is a first click on a image
        const clickHandler = function(event) {
            const target = event.target.closest('#comicImg');
            if (!target || hasInitializedGallery) return;

            event.preventDefault();
            hasInitializedGallery = true;

            // initialize gallery
            lightGalleryInstance = lightGallery(outputElement, {
                selector: 'a',
                zoom: true,
                fullScreen: true,
                download: false,
                enableTouch: true,
                thumbnail: true,
                animateThumb: true,
                showThumbByDefault: true,
                autoplay: false,
                autoplayControls: true,
                rotate: true
            });

            // track page changes
            outputElement.addEventListener('onAfterSlide', function(event) {
                const index = event.detail.index;

                saveLastPageRead(currentComicFilename, index);

                // clear previous highlight and apply to current page
                document.querySelectorAll('#output a.last-read').forEach(a => {
                    a.classList.remove('last-read');
                });

                const images = document.querySelectorAll('#output a');
                if (images[index]) {
                    images[index].classList.add('last-read');
                }
            });

            // trigger click to open gallery
            target.click();

            // remove the click handler after first use
            document.removeEventListener('click', clickHandler);
        };

        // add click handler for first image click
        document.addEventListener('click', clickHandler);

        // Update progress text
        progressTextElement.innerHTML = "Reading 0/0 pages";

        // show loading
        sePreConElement.style.display = 'block';

        // destroy previous lightGallery instance
        if (lightGalleryInstance) {
            lightGalleryInstance.destroy(true);
            lightGalleryInstance = null;
        }

        // clear previous blobs
        clearBlobs();

        // clear previous output data
        outputElement.innerHTML = '';

        // clear previous highlight
        document.querySelectorAll('#output a.last-read').forEach(a => {
            a.classList.remove('last-read');
        });

        // Open the file as an archive
        archiveOpenFile(file, (archive, err) => {
            if (archive) {
                outputElement.innerHTML = `<b>${archive.file_name}</b><br><i>Click on the image to enlarge</i><br><br>`;
                readContents(archive);
            } else {
                outputElement.innerHTML = `<span style="color: #ef4444;">${err}</span><br>`;

                // hide loading
                sePreConElement.style.display = 'none';

                // show output box
                outputElement.style.display = 'block';
            }
        });
    }

    async function readContents(archive) {
        const entries = archive.entries;
        const promises = [];

        for (let i = 0; i < entries.length; i++) {
            const filename = entries[i].name;
            if (getExt(filename) !== '') {
                promises.push(createBlobAsync(entries[i], i, entries.length));
            }
        }

        await Promise.all(promises);
    }

    function createBlobAsync(entry, i, max) {
        return new Promise((resolve) => {
            entry.readData((data, err) => {
                const blob = new Blob([data], { type: getMIME(entry.name) });
                const url = URL.createObjectURL(blob);

                const a = document.createElement('a');
                a.href = url;
                a.id = 'comicImg';

                const img = document.createElement('img');
                img.classList.add('imgUrl');
                img.src = url;

                a.appendChild(img);
                outputElement.appendChild(a);

                progressTextElement.innerHTML = `Reading ${i + 1}/${max} pages`;

                if (i === max - 1) {
                    progressTextElement.innerHTML = '<span style="color: #4ade80;">Completed!</span>';
                    sePreConElement.style.display = 'none';
                    outputElement.style.display = 'block';

                    // generate thumbnail from first image
                    setTimeout(() => {
                        generateThumbnailFromFirstImage();
                        highlightLastPage(currentComicFilename);
                    }, 100);
                }

                resolve();
            });
        });
    }

    function getExt(filename) {
        const ext = filename.split('.').pop();
        return (ext === filename) ? '' : ext;
    }

    function getMIME(filename) {
        const ext = getExt(filename).toLowerCase();
        const mimeTypes = {
            'jpg': 'image/jpeg',
            'jpeg': 'image/jpeg',
            'png': 'image/png',
            'gif': 'image/gif',
            'bmp': 'image/bmp',
            'webp': 'image/webp'
        };
        return mimeTypes[ext] || 'image/jpeg';
    }

    function clearBlobs() {
        document.querySelectorAll('.imgUrl').forEach(img => {
            URL.revokeObjectURL(img.src);
        });
    }

    function generateThumbnailFromFirstImage() {
        try {
            const firstImg = document.querySelector('#output a img.imgUrl');
            if (!firstImg) {
                return;
            }

            // Check if image is loaded
            if (!firstImg.complete || firstImg.naturalWidth === 0) {
                firstImg.onload = () => generateThumbnailFromFirstImage();
                return;
            }

            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d');
            const maxWidth = 100;
            const scale = maxWidth / firstImg.naturalWidth;
            canvas.width = maxWidth;
            canvas.height = firstImg.naturalHeight * scale;

            ctx.drawImage(firstImg, 0, 0, canvas.width, canvas.height);
            const thumbnail = canvas.toDataURL('image/jpeg', 0.7);

            // get existing data to preserve last_page
            const readingHistory = JSON.parse(localStorage.getItem('comic_reader_userpref') || '{}');
            const existing = readingHistory[currentComicFilename] || {};
            saveLastPageRead(currentComicFilename, existing.last_page || 0, thumbnail);
        } catch (e) {
            console.error('Failed to create thumbnail:', e);
        }
    }

    function saveLastPageRead(filename, pageIndex, thumbnail = null) {
        try {
            const readingHistory = JSON.parse(localStorage.getItem('comic_reader_userpref') || '{}');
            const existing = readingHistory[filename] || {};
            const finalThumbnail = thumbnail || existing.thumbnail || null;

            readingHistory[filename] = {
                last_page: pageIndex,
                timestamp: Date.now(),
                thumbnail: finalThumbnail
            };
            localStorage.setItem('comic_reader_userpref', JSON.stringify(readingHistory));
        } catch (e) {
            console.error('Failed to save reading history:', e);
        }
    }

    function getLastPageRead(filename) {
        try {
            const readingHistory = JSON.parse(localStorage.getItem('comic_reader_userpref') || '{}');
            return readingHistory[filename]?.last_page || 0;
        } catch (e) {
            console.error('Failed to read reading history:', e);
            return 0;
        }
    }

    function highlightLastPage(filename) {
        const lastPage = getLastPageRead(filename);

        if (lastPage > 0) {
            const images = document.querySelectorAll('#output a');

            if (images[lastPage]) {
                images[lastPage].classList.add('last-read');

                // scroll to last read page
                setTimeout(() => {
                    images[lastPage].scrollIntoView({ behavior: 'smooth', block: 'center' });
                }, 200);

                // remove highlight on click
                images[lastPage].addEventListener('click', function() {
                    this.classList.remove('last-read');
                }, { once: true });
            }
        }
    }

    // IndexedDB functions for storing directory handle
    function openDB() {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open('ComicReaderDB', 1);
            request.onerror = () => reject(request.error);
            request.onsuccess = () => resolve(request.result);
            request.onupgradeneeded = (event) => {
                const db = event.target.result;
                if (!db.objectStoreNames.contains('directories')) {
                    db.createObjectStore('directories');
                }
            };
        });
    }

    async function saveDirectoryHandle(dirHandle) {
        try {
            const db = await openDB();
            const tx = db.transaction('directories', 'readwrite');
            const store = tx.objectStore('directories');
            store.put(dirHandle, 'comicsFolder');
            await tx.complete;
        } catch (err) {
            console.error('Failed to save directory handle:', err);
        }
    }

    async function loadDirectoryHandle() {
        try {
            const db = await openDB();
            const tx = db.transaction('directories', 'readonly');
            const store = tx.objectStore('directories');
            const handle = await new Promise((resolve, reject) => {
                const request = store.get('comicsFolder');
                request.onsuccess = () => resolve(request.result);
                request.onerror = () => reject(request.error);
            });

            if (handle) {
                // verify we still have permission
                const permission = await handle.queryPermission({ mode: 'read' });
                if (permission === 'granted') {
                    return { handle, hasPermission: true };
                } else {
                    // permission is 'prompt' or 'denied' - need user interaction
                    return { handle, hasPermission: false };
                }
            }
            return { handle: null, hasPermission: false };
        } catch (err) {
            console.error('Failed to load directory handle:', err);
            return { handle: null, hasPermission: false };
        }
    }

    async function loadRecentComics() {
        try {
            const readingHistory = JSON.parse(localStorage.getItem('comic_reader_userpref') || '{}');

            const recentComics = Object.entries(readingHistory)
                .sort((a, b) => b[1].timestamp - a[1].timestamp)
                .slice(0, 5);

            recentComicsListEl.innerHTML = '';

            if (recentComics.length === 0) {
                return;
            }

            for (const [filename, data] of recentComics) {
                const item = document.createElement('div');
                item.className = 'recent-comic-item';

                const iconContent = data.thumbnail
                    ? `<img src="${data.thumbnail}" alt="" style="width: 100%; height: 100%; object-fit: cover; border-radius: 6px;">`
                    : `<svg viewBox="0 0 16 16">
                        <path d="M3.5 2a1.5 1.5 0 0 0-1.5 1.5v9A1.5 1.5 0 0 0 3.5 14h9a1.5 1.5 0 0 0 1.5-1.5v-9A1.5 1.5 0 0 0 12.5 2h-9zm6.854 6.146a.5.5 0 0 1 0 .708l-3 3a.5.5 0 0 1-.708-.708L8.793 9H5.5a.5.5 0 0 1 0-1h3.293L6.646 5.854a.5.5 0 1 1 .708-.708l3 3z"/>
                    </svg>`;

                item.innerHTML = `
                    <div class="recent-comic-icon">
                        ${iconContent}
                    </div>
                    <div class="recent-comic-info">
                        <div class="recent-comic-name">${filename}</div>
                        <div class="recent-comic-meta">Page ${data.last_page + 1} • ${formatTimestamp(data.timestamp)}</div>
                    </div>
                `;
                item.addEventListener('click', () => openComicFromFolder(filename));
                recentComicsListEl.appendChild(item);
            }
        } catch (err) {
            console.error('Failed to load recent comics:', err);
        }
    }

    async function removeComicFromHistory(filename) {
        const readingHistory = JSON.parse(localStorage.getItem('comic_reader_userpref') || '{}');
        if (readingHistory[filename]) {
            delete readingHistory[filename];
            localStorage.setItem('comic_reader_userpref', JSON.stringify(readingHistory));
            
            // Refresh UI
            await loadRecentComics();
            
            // Hide container if list is empty
            if (recentComicsListEl.children.length === 0) {
                recentComicsEl.style.display = 'none';
            }
        }
    }

    async function openComicFromFolder(filename) {
        try {
            if (!comicsDirectoryHandle) {
                throw new Error('Directory handle not available');
            }

            // check permission before accessing files
            const permission = await comicsDirectoryHandle.queryPermission({ mode: 'read' });
            if (permission !== 'granted') {
                // try to request permission
                const newPermission = await comicsDirectoryHandle.requestPermission({ mode: 'read' });
                if (newPermission !== 'granted') {
                    showReconnectButton();
                    return;
                }
            }

            const fileHandle = await comicsDirectoryHandle.getFileHandle(filename);
            const file = await fileHandle.getFile();
            openComic(file);
            // refresh recent list after opening
            setTimeout(async () => {
                if (comicsDirectoryHandle) {
                    await loadRecentComics();
                    // show recently read if not already visible
                    if (recentComicsListEl.children.length > 0) {
                        recentComicsEl.style.display = 'block';
                    }
                }
            }, 500);
        } catch (err) {
            console.error('Failed to open comic:', err);
            if (err.name === 'NotAllowedError') {
                showReconnectButton();
            } else {
                alert('Could not find this comic in the selected folder. Please re-upload it or select a different folder.');
                await removeComicFromHistory(filename);
            }
        }
    }

    function formatTimestamp(timestamp) {
        const now = Date.now();
        const diff = now - timestamp;
        const seconds = Math.floor(diff / 1000);
        const minutes = Math.floor(seconds / 60);
        const hours = Math.floor(minutes / 60);
        const days = Math.floor(hours / 24);

        if (days > 0) return `${days}d ago`;
        if (hours > 0) return `${hours}h ago`;
        if (minutes > 0) return `${minutes}m ago`;
        return 'Just now';
    }
});
