document.addEventListener('DOMContentLoaded', () => {
    const el = (id) => document.getElementById(id);
    const wrap = document.querySelector('.wrap');
    const output = el('output');
    const folderInput = el('folderInput');
    const collectionDialog = el('collectionDialog');
    const supportsPersistentAccess = typeof window.showDirectoryPicker === 'function';
    const supportsFolderInput = 'webkitdirectory' in folderInput;
    const canSelectFolders = supportsPersistentAccess || supportsFolderInput;
    const storageKey = 'comic_reader_libraries';
    const access = new Map(); // Child handles and session Files stay in memory.
    const rootAccess = { handle: null, connected: false, needsPicker: false };
    let pendingConfirmation = null;
    let state = readState();
    let activeLibraryId = null;
    let currentView = 'home';
    let pendingSelection = null;
    let busy = false;
    let reading = null;
    let comicRequest = 0;
    let readerGeneration = 0;
    let galleryElement = null;
    let galleryClickHandler = null;
    let archiveReader = null;
    let objectUrls = [];

    el('currYear').textContent = new Date().getFullYear();
    loadArchiveFormats(['rar', 'zip', 'tar']);
    el('browserNotice').hidden = supportsPersistentAccess;
    el('browserNotice').textContent = canSelectFolders
        ? 'Folder access is session-only. Reselect the root after reloading; saved reading history is kept. Empty folders are not included.'
        : 'Folder selection is unavailable in this browser. Use Quick Read to open individual comics.';
    el('dismissMessageBtn').addEventListener('click', () => notify(''));

    el('selectRootBtn').addEventListener('click', () => chooseRoot(true));
    el('reconnectRootBtn').addEventListener('click', () => chooseRoot());
    el('reconnectLibraryBtn').addEventListener('click', () => chooseRoot(false, true));
    el('chooseRootBtn').addEventListener('click', () => chooseRoot(true, true));
    el('quickReadBtn').addEventListener('click', showQuickRead);
    el('toggleUploadBtn').addEventListener('click', showQuickRead);
    el('allLibrariesBtn').addEventListener('click', showHome);
    el('backToLibraryBtn').addEventListener('click', showHome);
    el('removeLibraryBtn').addEventListener('click', () => confirmRemoval(activeLibraryId));
    el('rediscoverCollectionsBtn').addEventListener('click', confirmRediscovery);
    collectionDialog.addEventListener('cancel', (event) => { event.preventDefault(); finishConfirmation(false); });
    collectionDialog.addEventListener('close', () => {
        if (!collectionDialog.hasAttribute('open')) finishConfirmation(false);
    });
    el('cancelCollectionActionBtn').addEventListener('click', () => finishConfirmation(false));
    el('confirmCollectionActionBtn').addEventListener('click', () => finishConfirmation(true));
    // Older directory-input browsers still get an app dialog, never a browser confirm.
    document.addEventListener('keydown', (event) => {
        if (!pendingConfirmation || !collectionDialog.classList.contains('dialog-fallback')) return;
        if (event.key === 'Escape') { event.preventDefault(); finishConfirmation(false); }
        if (event.key === 'Tab') {
            event.preventDefault();
            const cancel = el('cancelCollectionActionBtn');
            (document.activeElement === cancel ? el('confirmCollectionActionBtn') : cancel).focus();
        }
    });
    // Closing the reader returns to the view the comic was opened from.
    el('readerBackBtn').addEventListener('click', () => {
        if (currentView === 'library') showLibrary(activeLibraryId);
        else if (currentView === 'quick') showQuickRead();
        else showHome();
    });
    // Show or hide the panel above the open comic without closing it.
    el('readerToggleBtn').addEventListener('click', () => {
        wrap.classList.toggle('collapsed');
        updateReaderToggle();
        if (currentView === 'library') renderLibrary();
        else if (currentView === 'home') renderHome();
    });

    folderInput.addEventListener('change', async () => {
        const selection = pendingSelection;
        pendingSelection = null;
        const files = Array.from(folderInput.files);
        folderInput.value = '';
        if (!selection || !files.length) return;
        setBusy(true);
        try {
            const name = files[0].webkitRelativePath.split('/')[0];
            const groups = new Map();
            const loose = new Map();
            for (const file of files) {
                const parts = file.webkitRelativePath.split('/');
                if (parts.length === 2) {
                    if (isComic(file.name)) loose.set(file.name, file);
                    continue;
                }
                if (!groups.has(parts[1])) groups.set(parts[1], { handle: null, files: new Map() });
                // Root / collection / comic only; deeper folders are not recursively scanned.
                if (parts.length === 3 && isComic(file.name)) groups.get(parts[1]).files.set(file.name, file);
            }
            await acceptRoot(name, withLooseGroup(name, groups, { handle: null, files: loose }), null, selection.openAfter);
        } catch (error) {
            notify("Could not scan the root folder. Saved collections and history are unchanged.", "error");
            console.error(error);
        } finally {
            setBusy(false);
            renderHome();
            if (currentView === 'library') renderLibrary();
        }
    });
    folderInput.addEventListener('cancel', () => {
        const wasReconnecting = pendingSelection && state.root;
        pendingSelection = null;
        if (wasReconnecting) notify(`Selection canceled for "${state.root.name}". Saved data is unchanged.`);
    });

    if (window.Dropzone) {
        Dropzone.autoDiscover = false;
        new Dropzone('#dropzone', {
            url: '#', acceptedFiles: '.cbr,.cbz,.cbt', createImageThumbnails: false,
            autoProcessQueue: false, previewsContainer: false, maxFiles: 1,
            init: function() {
                this.on('addedfile', (file) => {
                    if (!isComic(file.name) || file.size > this.options.maxFilesize * 1024 * 1024) return;
                    openComic(file); // Quick Read never writes collection progress.
                    this.removeFile(file);
                });
                this.on('error', (file) => {
                    notify(!isComic(file.name) ? "Select a CBR, CBZ, or CBT file."
                        : file.size > this.options.maxFilesize * 1024 * 1024 ? "This file exceeds the file-size limit." : "Could not open the selected file. Try selecting it again.", 'error');
                    this.removeFile(file);
                });
            }
        });
    }

    renderHome();
    initialize().catch((error) => {
        disconnectRoot();
        rootAccess.needsPicker = true;
        console.error('Could not restore the comics root:', error);
        notify("Could not restore folder access. Reconnect the root folder. Saved collections are unchanged.", "error");
    }).finally(() => {
        setBusy(false);
        renderHome();
        if (currentView === 'library') renderLibrary();
    });

    function readState() {
        try {
            const saved = JSON.parse(localStorage.getItem(storageKey) || 'null');
            if (saved?.version === 3 && Array.isArray(saved.libraries) && Array.isArray(saved.removedFolders)) return saved;
        } catch (error) {
            console.error('Could not read saved collections:', error);
            notify("Could not read browser storage. Collections may not be saved across reloads.", "error");
        }
        return { version: 3, root: null, libraries: [], removedFolders: [], legacyImported: false };
    }

    function saveState() {
        try {
            localStorage.setItem(storageKey, JSON.stringify(state));
            return true;
        } catch (error) {
            console.error('Could not save collections:', error);
            notify("Could not save changes. Browser storage may be full or blocked; recent changes may be lost on reload.", "error");
            return false;
        }
    }

    function notify(message, kind = 'info') {
        el('appMessage').hidden = !message;
        el('appMessage').dataset.kind = kind;
        el('appMessageText').textContent = message;
    }

    function connection(id) {
        if (!access.has(id)) access.set(id, { handle: null, files: null, connected: false, legacyHandle: null });
        return access.get(id);
    }

    function disconnectRoot() {
        rootAccess.connected = false;
        for (const runtime of access.values()) runtime.connected = false;
    }

    function libraryById(id) { return state.libraries.find((library) => library.id === id); }
    function isComic(name) { return /\.(cbr|cbz|cbt)$/i.test(name); }
    function isImage(name) { return /\.(jpe?g|png|gif|bmp|webp)$/i.test(name); }
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

    function newId() {
        return crypto.randomUUID ? crypto.randomUUID() : `library-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    }
    function newLibrary(name) {
        return { id: newId(), name, folderName: name, inRoot: true, comics: [], history: {}, cover: null };
    }

    function confirmCollectionAction(title, description, consequence, label) {
        if (pendingConfirmation) return Promise.resolve(false);
        return new Promise((resolve) => {
            pendingConfirmation = { resolve, focus: document.activeElement };
            el('collectionDialogTitle').textContent = title;
            el('collectionDialogDescription').textContent = description;
            el('collectionDialogConsequence').textContent = consequence;
            el('confirmCollectionActionBtn').textContent = label;
            if (typeof collectionDialog.showModal === 'function') collectionDialog.showModal();
            else {
                collectionDialog.classList.add('dialog-fallback');
                collectionDialog.setAttribute('open', '');
                el('dialogBackdrop').hidden = false;
                document.querySelectorAll('.wrap, #output').forEach((node) => { node.inert = true; });
            }
            el('cancelCollectionActionBtn').focus();
        });
    }

    function finishConfirmation(accepted) {
        if (!pendingConfirmation) return;
        const request = pendingConfirmation;
        pendingConfirmation = null;
        if (collectionDialog.classList.contains('dialog-fallback')) {
            collectionDialog.removeAttribute('open');
            collectionDialog.classList.remove('dialog-fallback');
            el('dialogBackdrop').hidden = true;
            document.querySelectorAll('.wrap, #output').forEach((node) => { node.inert = false; });
        } else if (collectionDialog.open) collectionDialog.close();
        request.focus?.focus();
        request.resolve(accepted);
    }

    async function confirmRemoval(id) {
        if (busy) return;
        const library = libraryById(id);
        if (!library) return;
        const hasAnother = state.libraries.some((other) => other.id !== id && other.folderName === library.folderName);
        const consequence = hasAnother
            ? 'The other saved collection with this folder name will remain.'
            : (library.inRoot ? 'This collection was found in the last root scan. ' : '')
                + 'This folder name will be excluded from future scans. '
                + 'Use “Rediscover removed” to add it again without its previous history.';
        const confirmed = await confirmCollectionAction(`Remove "${library.name}"?`,
            'Remove its saved comic list, progress, last-read information, and thumbnails from this browser. '
                + 'Folders and comic files are not changed or deleted.', consequence,
            'Remove collection');
        if (confirmed && !busy) removeCollection(id);
    }

    function removeCollection(id) {
        const library = libraryById(id);
        if (!library) return;
        const previous = state;
        const libraries = state.libraries.filter((other) => other.id !== id);
        const removedFolders = new Set(state.removedFolders);
        if (!libraries.some((other) => other.folderName === library.folderName)) removedFolders.add(library.folderName);
        state = { ...state, libraries, removedFolders: [...removedFolders] };
        // Persist before releasing access or updating the shelf; failed storage keeps the entry intact.
        if (!saveState()) {
            state = previous;
            notify(`Could not remove "${library.name}". Browser storage may be full or blocked. The collection and history are unchanged.`, "error");
            return;
        }
        access.delete(id);
        if (activeLibraryId === id) { activeLibraryId = null; showHome(); }
        else renderHome();
        notify(`Removed "${library.name}" from the library. Folders and comic files are unchanged.`, "success");
        el(state.removedFolders.length ? 'rediscoverCollectionsBtn' : 'selectRootBtn').focus();
    }

    async function confirmRediscovery() {
        if (busy || !state.removedFolders.length) return;
        const confirmed = await confirmCollectionAction("Rediscover removed collections?", `Include these folder names in future scans: ${state.removedFolders.join(', ')}.`,
            "Rescan or reconnect the root to add them. Previous history and thumbnails are not restored. Folders and comic files are unchanged.", 'Allow rediscovery');
        if (confirmed && !busy) {
            const previous = state.removedFolders;
            state.removedFolders = [];
            if (!saveState()) {
                state.removedFolders = previous;
                notify("Could not save changes. Removed folders remain excluded. Browser storage may be full or blocked.", "error");
                return;
            }
            renderHome();
            notify("Rescan or reconnect the root to add removed collections. Previous history is not restored.");
            el(state.root && !rootAccess.connected && canSelectFolders ? 'reconnectRootBtn' : 'selectRootBtn').focus();
        }
    }

    function setBusy(value) {
        busy = value;
        document.querySelectorAll('[data-folder-action], #selectRootBtn, #reconnectRootBtn, #reconnectLibraryBtn, #chooseRootBtn')
            .forEach((button) => { button.disabled = busy || !canSelectFolders; });
        document.querySelectorAll('[data-collection-action]')
            .forEach((button) => { button.disabled = busy; });
    }

    async function initialize() {
        setBusy(true);
        if (!state.root) {
            if (supportsPersistentAccess) {
                if (!state.legacyImported) {
                    const oldHandle = await directoryStore('get', 'comicsFolder');
                    if (oldHandle && !state.removedFolders.includes(oldHandle.name)) {
                        const library = newLibrary(oldHandle.name);
                        Object.assign(library, { inRoot: false, needsLegacyScan: true, history: legacyHistory() });
                        library.cover = Object.values(library.history).find((data) => data.thumbnail)?.thumbnail || null;
                        state.libraries.push(library);
                        state.legacyImported = true;
                        connection(library.id).legacyHandle = oldHandle;
                    }
                }
            }
            // Save the migration only after selecting a root, retaining old data until then.
            return;
        }
        if (!supportsPersistentAccess || !state.root.handleSaved) return;
        rootAccess.handle = await directoryStore('get', 'comicsRoot');
        if (rootAccess.handle && await rootAccess.handle.queryPermission({ mode: 'read' }) === 'granted') {
            const groups = await groupsFromHandle(rootAccess.handle);
            await connectGroups(rootAccess.handle.name, groups, rootAccess.handle, true);
        }
    }

    function legacyHistory() {
        try { return JSON.parse(localStorage.getItem('comic_reader_userpref') || '{}'); }
        catch (error) { console.error('Could not read old history:', error); return {}; }
    }

    async function directoryStore(operation, id, handle) {
        const db = await new Promise((resolve, reject) => {
            const request = indexedDB.open('ComicReaderDB', 1);
            request.onupgradeneeded = () => {
                if (!request.result.objectStoreNames.contains('directories')) request.result.createObjectStore('directories');
            };
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
        try {
            return await new Promise((resolve, reject) => {
                const tx = db.transaction('directories', operation === 'get' ? 'readonly' : 'readwrite');
                const store = tx.objectStore('directories');
                const request = operation === 'get' ? store.get(id) : store.put(handle, id);
                let result;
                request.onsuccess = () => { result = request.result; };
                tx.oncomplete = () => resolve(result);
                tx.onerror = () => reject(tx.error);
                tx.onabort = () => reject(tx.error || new Error('Folder storage was interrupted'));
            });
        } finally { db.close(); }
    }

    async function storeRootHandle(handle) {
        try {
            await directoryStore('put', 'comicsRoot', handle);
            return true;
        }
        catch (error) {
            console.error('Could not save the root handle:', error);
            notify("Could not save folder access. Reselect the root after reloading. Collection metadata is kept.", "error");
            return false;
        }
    }

    async function groupsFromHandle(root) {
        const groups = new Map();
        const loose = [];
        for await (const entry of root.values()) {
            if (entry.kind === 'file') {
                if (isComic(entry.name)) loose.push(entry.name);
                continue;
            }
            const names = [];
            for await (const comic of entry.values()) {
                if (comic.kind === 'file' && isComic(comic.name)) names.push(comic.name);
            }
            groups.set(entry.name, { handle: entry, names });
        }
        return withLooseGroup(root.name, groups, { handle: root, names: loose });
    }

    // Comics directly inside the root form a collection named after the root, so a
    // single flat comics folder (the pre-collections layout) keeps working.
    function withLooseGroup(rootName, groups, loose) {
        if (!(loose.names?.length || loose.files?.size)) return groups;
        const name = groups.has(rootName) ? `${rootName} (root folder)` : rootName;
        // First, so the old single-folder library is matched to it before any child folder.
        return new Map([[name, loose], ...groups]);
    }

    async function matchCollection(name, group, used) {
        const available = state.libraries.filter((library) => !used.has(library.id));
        const linked = available.find((library) => !library.needsLegacyScan && library.folderName === name);
        if (linked) return linked;
        // Upstream saved one folder handle, under comicsFolder, rather than handles per collection.
        const previous = available.find((library) => library.needsLegacyScan);
        const handle = previous && connection(previous.id).legacyHandle;
        if (group.handle && handle) {
            try { if (await group.handle.isSameEntry(handle)) return previous; }
            catch (error) { console.info('Could not compare the previous folder handle:', error); }
        }
        return available.find((library) => library.folderName === name) || null;
    }

    async function connectGroups(name, groups, handle, handleSaved = false) {
        const matches = [];
        const used = new Set();
        // Resolve all identities before updating the remembered shelf.
        for (const [folderName, group] of groups) {
            if (state.removedFolders.includes(folderName)) continue;
            const library = await matchCollection(folderName, group, used) || newLibrary(folderName);
            used.add(library.id);
            matches.push({ library, folderName, group });
        }
        for (const library of state.libraries) library.inRoot = false;
        for (const { library, folderName, group } of matches) {
            if (!state.libraries.includes(library)) state.libraries.push(library);
            Object.assign(library, { name: folderName, folderName, inRoot: true,
                comics: Array.from(group.names || group.files.keys(), (name) => ({ name }))
                    .sort((a, b) => a.name.localeCompare(b.name, 'en', { numeric: true }) || (a.name < b.name ? -1 : a.name > b.name ? 1 : 0)) });
            delete library.needsLegacyScan;
        }
        if (!state.legacyImported) {
            const oldHistory = legacyHistory();
            for (const [filename, data] of Object.entries(oldHistory)) {
                const candidates = matches.map((match) => match.library).filter((library) => library.comics.some((comic) => comic.name === filename));
                if (candidates.length === 1 && !candidates[0].history[filename]) candidates[0].history[filename] = data;
            }
            if (matches.length) state.legacyImported = true;
        }
        state.root = { id: state.root?.id || newId(), name, handleSaved };
        disconnectRoot();
        Object.assign(rootAccess, { handle, connected: true, needsPicker: false });
        for (const { library, group } of matches) {
            Object.assign(connection(library.id), { handle: group.handle, files: handle ? null : group.files, connected: true });
        }
        notify('');
        saveState();
        renderHome();
        if (currentView === 'library') renderLibrary();
    }

    async function acceptRoot(name, groups, handle, openAfter) {
        if (state.root) {
            let sameRoot = state.root.name === name;
            if (handle && rootAccess.handle) {
                try { sameRoot = await handle.isSameEntry(rootAccess.handle); }
                catch (error) { console.info('Could not compare the previous root:', error); }
            }
            if (!sameRoot && !await confirmCollectionAction("Replace root folder?", `Use "${name}" instead of "${state.root.name}" as the root folder.`,
                "Matching collection names keep their history; missing collections remain saved.", 'Use this folder')) return;
        }
        await connectGroups(name, groups, handle);
        if (handle) {
            state.root.handleSaved = await storeRootHandle(handle);
            saveState();
        }
        if (openAfter && libraryById(activeLibraryId)) showLibrary(activeLibraryId);
    }

    async function chooseRoot(forcePicker = false, openAfter = false) {
        if (busy || !canSelectFolders) return;
        notify('');
        if (!supportsPersistentAccess) {
            pendingSelection = { openAfter };
            notify(state.root ? `Select "${state.root.name}" to reconnect all collections.` : "Select a root folder. Its comics, and each folder of comics inside it, become collections.");
            folderInput.click();
            return;
        }
        setBusy(true);
        try {
            if (rootAccess.handle && !rootAccess.needsPicker && !forcePicker) {
                const permission = await rootAccess.handle.requestPermission({ mode: 'read' });
                if (permission !== 'granted') {
                    disconnectRoot();
                    rootAccess.needsPicker = true;
                    notify("Folder permission was not granted. Try again to select the root. Saved collections are unchanged.", "error");
                    return;
                }
                const groups = await groupsFromHandle(rootAccess.handle);
                await connectGroups(rootAccess.handle.name, groups, rootAccess.handle, state.root?.handleSaved || false);
                if (openAfter && libraryById(activeLibraryId)) showLibrary(activeLibraryId);
            } else {
                const options = { mode: 'read', id: 'comics-root' };
                if (rootAccess.handle) options.startIn = rootAccess.handle;
                const handle = await window.showDirectoryPicker(options);
                const groups = await groupsFromHandle(handle);
                await acceptRoot(handle.name, groups, handle, openAfter);
            }
        } catch (error) {
            if (error.name !== 'AbortError') {
                disconnectRoot();
                rootAccess.needsPicker = true;
                notify("Could not access the root folder. Reselect it to reconnect. Saved collections and progress are unchanged.", "error");
                console.error(error);
            }
        } finally {
            setBusy(false);
            renderHome();
            if (currentView === 'library') renderLibrary();
        }
    }

    function setView(view) {
        clearReader();
        currentView = view;
        el('initialView').style.display = view === 'home' ? 'block' : 'none';
        el('libraryView').style.display = view === 'library' ? 'block' : 'none';
        el('quickReadView').style.display = view === 'quick' ? 'block' : 'none';
        wrap.classList.remove('collapsed');
    }

    function showHome() { setView('home'); renderHome(); }
    function showQuickRead() { setView('quick'); }
    function showLibrary(id) { activeLibraryId = id; setView('library'); renderLibrary(); }

    function historyEntries(library) {
        if (library.needsLegacyScan) return Object.entries(library.history).sort((a, b) => b[1].timestamp - a[1].timestamp);
        // Filter the display only; keep missing comics' progress and thumbnails for future scans.
        return library.comics.filter((comic) => library.history[comic.name])
            .map((comic) => [comic.name, library.history[comic.name]])
            .sort((a, b) => b[1].timestamp - a[1].timestamp);
    }

    function progressText(data) {
        if (!data) return "Not started";
        return data.total_pages ? `Page ${Math.min(data.last_page + 1, data.total_pages)} of ${data.total_pages}` : `Page ${data.last_page + 1}`;
    }

    function coverElement(thumbnail, name) {
        const cover = document.createElement('div');
        cover.className = 'collection-cover';
        if (thumbnail) {
            const img = document.createElement('img');
            img.src = thumbnail;
            img.alt = '';
            cover.appendChild(img);
        } else {
            const letter = document.createElement('span');
            letter.textContent = name.slice(0, 1).toUpperCase();
            cover.appendChild(letter);
        }
        return cover;
    }

    function renderHome() {
        const list = el('librariesList');
        list.replaceChildren();
        const discovered = state.libraries.filter((library) => library.inRoot);
        const count = discovered.reduce((total, library) => total + library.comics.length, 0);
        const savedMissing = state.libraries.length - discovered.length;
        el('librarySummary').textContent = `${discovered.length} collections · ${count} comics` + (savedMissing ? ` · ${savedMissing} unavailable` : '');
        el('selectRootBtn').textContent = state.root ? "Choose root folder" : "Select Comics Folder";
        el('selectRootBtn').classList.toggle('primary', !state.root);
        el('reconnectRootBtn').hidden = !state.root || rootAccess.connected || !canSelectFolders;
        el('reconnectRootBtn').textContent = `Reconnect ${state.root?.name || "Root Folder"}`;
        el('rootFolderStatus').textContent = state.root
            ? `${state.root.name} · ${rootAccess.connected ? (rootAccess.handle ? "Connected" : "Connected for this session") : "Reconnect to access collections"}`
            : "Select a root folder containing collection folders.";
        el('rediscoverCollectionsBtn').hidden = !state.removedFolders.length;
        el('rediscoverCollectionsBtn').textContent = `Rediscover removed (${state.removedFolders.length})`;
        el('emptyLibraries').hidden = state.libraries.length > 0;
        el('emptyLibraries').querySelector('h2').textContent = state.removedFolders.length ? "No saved collections" : state.root ? "No collections found" : "No collections";
        el('emptyLibraries').querySelector('p').textContent = state.root
            ? `Add comics or folders of comics to "${state.root.name}", then reselect the root.` + (state.removedFolders.length ? " Use “Rediscover removed” to include removed folders." : '')
            : "Select a root folder. Its comics, and each folder of comics inside it, become collections.";
        for (const library of [...state.libraries].sort((a, b) => Number(b.inRoot) - Number(a.inRoot) || a.name.localeCompare(b.name, 'en', { numeric: true }) || (a.name < b.name ? -1 : a.name > b.name ? 1 : 0))) {
            const runtime = connection(library.id);
            const entries = historyEntries(library);
            const latest = entries[0];
            const completed = entries.filter(([, data]) => data.total_pages && data.last_page + 1 >= data.total_pages).length;
            const card = document.createElement('article');
            card.className = 'collection-card';
            const open = document.createElement('button');
            open.className = 'collection-open';
            open.setAttribute('aria-label', `Open ${library.name}`);
            // Follow the last-read comic so the cover matches the card's description.
            open.appendChild(coverElement(latest?.[1].thumbnail || library.cover || entries.find(([, data]) => data.thumbnail)?.[1].thumbnail, library.name));
            const title = document.createElement('h2');
            title.textContent = library.name;
            open.appendChild(title);
            open.addEventListener('click', () => showLibrary(library.id));
            card.appendChild(open);
            const details = document.createElement('div');
            details.className = 'collection-details';
            const status = document.createElement('span');
            status.className = `connection-status ${runtime.connected ? 'connected' : 'disconnected'}`;
            status.textContent = runtime.connected ? (rootAccess.handle ? "Connected" : "Connected for this session")
                : !state.root ? "Choose parent folder" : !library.inRoot ? "Not found in root" : "Reconnect root folder";
            details.appendChild(status);
            const stats = document.createElement('p');
            stats.className = 'collection-stats';
            stats.textContent = library.needsLegacyScan ? "Connect to count comics" : `${library.comics.length} comics · ${entries.length} started · ${completed} finished`;
            details.appendChild(stats);
            let lastRead;
            if (latest) {
                // Sits above the card's stretched open button, like Remove.
                lastRead = document.createElement('button');
                lastRead.className = 'collection-last-read continue-btn';
                lastRead.setAttribute('aria-label', `Continue reading ${latest[0]}`);
                lastRead.setAttribute('data-collection-action', '');
                lastRead.addEventListener('click', () => {
                    showLibrary(library.id);
                    openLibraryComic(library.id, latest[0]);
                });
                const label = document.createElement('span');
                label.className = 'last-read-label';
                label.textContent = '▶ Continue reading';
                const comic = document.createElement('span');
                comic.className = 'last-read-title';
                comic.textContent = latest[0].replace(/\.(cbr|cbz|cbt)$/i, '');
                comic.title = latest[0];
                const meta = document.createElement('span');
                meta.className = 'last-read-meta';
                meta.textContent = `${progressText(latest[1])} · ${formatTimestamp(latest[1].timestamp)}`;
                lastRead.append(label, comic, meta);
            } else {
                lastRead = document.createElement('p');
                lastRead.className = 'collection-last-read';
                lastRead.textContent = "No reading history";
            }
            details.appendChild(lastRead);
            const progress = document.createElement('progress');
            progress.max = library.comics.length || 1;
            progress.value = library.comics.reduce((total, comic) => {
                const data = library.history[comic.name];
                return total + (data?.total_pages ? Math.min((data.last_page + 1) / data.total_pages, 1) : 0);
            }, 0);
            progress.setAttribute('aria-label', `Known reading progress for ${library.name}`);
            details.appendChild(progress);
            const remove = document.createElement('button');
            remove.className = 'link-btn remove-collection-btn';
            remove.textContent = "Remove collection";
            remove.setAttribute('aria-label', `Remove ${library.name} from saved library`);
            remove.setAttribute('data-collection-action', '');
            remove.addEventListener('click', () => confirmRemoval(library.id));
            details.appendChild(remove);
            card.appendChild(details);
            list.appendChild(card);
        }
        setBusy(busy);
    }

    function renderLibrary() {
        const library = libraryById(activeLibraryId);
        if (!library) { showHome(); return; }
        const runtime = connection(library.id);
        el('libraryTitle').textContent = library.name;
        el('currentFolderName').textContent = `${library.comics.length} comics${state.root && state.root.name !== library.name ? ` · ${state.root.name}` : ''} · ${runtime.connected ? (rootAccess.handle ? "Connected" : "Session access") : "Unavailable"}`;
        el('reconnectLibraryBtn').hidden = runtime.connected;
        el('reconnectLibraryBtn').textContent = !state.root ? "Select root folder" : rootAccess.connected ? "Rescan root" : "Reconnect root";
        el('chooseRootBtn').hidden = !canSelectFolders;
        el('libraryConnectionNotice').hidden = runtime.connected;
        el('libraryConnectionNotice').textContent = canSelectFolders
            ? !state.root ? "Select the root folder to reconnect saved collections."
                : !library.inRoot ? `Collection not found in "${state.root.name}". Restore its folder and rescan the root. History is kept.`
                : `Reconnect "${state.root.name}" to access all collections.`
            : "Use a browser with folder selection support to reconnect. Saved history is kept.";
        const recent = historyEntries(library).slice(0, 5);
        el('recentComicsList').replaceChildren(...recent.map(([name]) => comicRow(library, name)));
        el('recentComics').style.display = recent.length ? 'block' : 'none';
        el('allComics').style.display = 'block';
        el('allComicsList').replaceChildren(...library.comics.map((comic) => comicRow(library, comic.name)));
        if (!library.comics.length) {
            const empty = document.createElement('p');
            empty.className = 'empty-comics';
            empty.textContent = library.needsLegacyScan ? "Select the root folder to list comics." : "No supported comics in this folder. Nested folders are ignored.";
            el('allComicsList').appendChild(empty);
        }
        setBusy(busy);
    }

    function comicRow(library, name) {
        const data = library.history[name];
        const row = document.createElement('button');
        row.className = 'recent-comic-item';
        const cover = coverElement(data?.thumbnail, name);
        cover.className = 'recent-comic-icon';
        row.appendChild(cover);
        const info = document.createElement('div');
        info.className = 'recent-comic-info';
        const title = document.createElement('div');
        title.className = 'recent-comic-name';
        title.textContent = name;
        const meta = document.createElement('div');
        meta.className = 'recent-comic-meta';
        meta.textContent = `${progressText(data)}${data ? ` · ${formatTimestamp(data.timestamp)}` : ''}`;
        info.append(title, meta);
        row.appendChild(info);
        row.addEventListener('click', () => openLibraryComic(library.id, name));
        return row;
    }

    async function getComicFile(library, name) {
        const runtime = connection(library.id);
        if (!rootAccess.connected) throw new DOMException('Reconnect the root folder', 'NotAllowedError');
        if (!runtime.connected) throw new DOMException('Collection is not in the selected root', 'NotFoundError');
        if (runtime.files) {
            const file = runtime.files.get(name);
            if (!file) throw new DOMException('Comic is no longer in this folder', 'NotFoundError');
            return file;
        }
        if (await rootAccess.handle.queryPermission({ mode: 'read' }) !== 'granted') {
            disconnectRoot();
            throw new DOMException('Root folder permission is required', 'NotAllowedError');
        }
        return (await runtime.handle.getFileHandle(name)).getFile();
    }

    async function openLibraryComic(id, name) {
        if (busy) return;
        const request = ++comicRequest;
        const library = libraryById(id);
        try {
            const file = await getComicFile(library, name);
            if (request !== comicRequest) return;
            openComic(file, id);
        } catch (error) {
            if (request !== comicRequest) return;
            if (error.name === 'NotAllowedError' || error.name === 'SecurityError') {
                disconnectRoot();
                notify("Reconnect the root folder to access comics.");
            } else {
                notify("Could not read this comic. Reselect the root to refresh the list. Progress is kept.", "error");
            }
            renderHome();
            renderLibrary();
        }
    }

    function openArchive(file) {
        // The vendor's archiveOpenFile has no read-error or abort callback.
        // Keep its archive decoder, but handle disconnected files and reader cleanup here.
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            archiveReader = reader;
            reader.onload = () => {
                if (archiveReader === reader) archiveReader = null;
                try { resolve(archiveOpenArrayBuffer(file.name, reader.result)); }
                catch (error) { reject(error); }
            };
            reader.onerror = () => {
                if (archiveReader === reader) archiveReader = null;
                reject(reader.error || new Error('Could not read comic file'));
            };
            reader.onabort = () => reject(new DOMException('Reading canceled', 'AbortError'));
            reader.readAsArrayBuffer(file.slice());
        });
    }
    function readEntry(entry) {
        return new Promise((resolve, reject) => entry.readData((data, error) => error ? reject(error)
            : resolve(new Blob([data], { type: getMIME(entry.name) }))));
    }

    async function readContents(entries, generation, loadingProgressElement) {
        const blobs = new Array(entries.length);
        let next = 0;
        let completed = 0;
        let failed = false;
        loadingProgressElement.textContent = `Reading 0/${entries.length} pages`;

        async function readPages() {
            while (!failed && generation === readerGeneration && next < entries.length) {
                const index = next++;
                try {
                    const blob = await readEntry(entries[index]);
                    if (failed || generation !== readerGeneration) return;
                    // Store by archive position, but count successful completions independently.
                    blobs[index] = blob;
                    loadingProgressElement.textContent = `Reading ${++completed}/${entries.length} pages`;
                    // Yield so even synchronous archive callbacks allow progress to paint.
                    await new Promise((resolve) => setTimeout(resolve, 0));
                } catch (error) {
                    failed = true;
                    throw error;
                }
            }
        }

        await Promise.all(Array.from({ length: Math.min(3, entries.length) }, readPages));
        return blobs;
    }

    async function thumbnailFromBlob(blob) {
        const url = URL.createObjectURL(blob);
        try {
            const image = new Image();
            await new Promise((resolve, reject) => {
                image.onload = resolve;
                image.onerror = reject;
                image.src = url;
            });
            const canvas = document.createElement('canvas');
            canvas.width = 160;
            canvas.height = Math.max(1, Math.round(image.naturalHeight * 160 / image.naturalWidth));
            canvas.getContext('2d').drawImage(image, 0, 0, canvas.width, canvas.height);
            return canvas.toDataURL('image/jpeg', 0.7);
        } finally { URL.revokeObjectURL(url); }
    }

    async function openComic(file, libraryId = null) {
        clearReader();
        const context = { libraryId, name: file.name, page: libraryById(libraryId)?.history[file.name]?.last_page || 0, totalPages: 0 };
        reading = context;
        const generation = readerGeneration;
        wrap.classList.add('collapsed', 'reading');
        el('readerBackBtn').dataset.label = `← ${libraryById(libraryId)?.name || 'Quick Read'}`;
        updateReaderToggle();
        el('readerTitle').textContent = file.name;
        el('readerTitle').title = file.name;
        const loadingProgressElement = document.querySelector('.progress-text');
        const loading = document.querySelector('.se-pre-con');
        loadingProgressElement.textContent = 'Reading 0/0 pages';
        loading.style.display = 'block';
        try {
            const archive = await openArchive(file);
            if (generation !== readerGeneration) return;
            const entries = archive.entries.filter((entry) => isImage(entry.name));
            if (!entries.length) throw new Error('No images');
            const blobs = await readContents(entries, generation, loadingProgressElement);
            if (generation !== readerGeneration) return;
            context.totalPages = blobs.length;
            context.page = Math.min(context.page, blobs.length - 1);
            const hint = document.createElement('p');
            hint.className = 'reader-hint';
            hint.textContent = 'Click on the image to enlarge';
            const pages = document.createElement('div');
            galleryElement = pages;
            // A separate gallery element prevents delayed events from an old comic affecting a new one.
            pages.addEventListener('onAfterSlide', (event) => {
                if (generation !== readerGeneration) return;
                context.page = event.detail.index;
                saveReading(context);
                highlightPage(context.page);
            });
            pages.addEventListener('onCloseAfter', () => {
                if (generation === readerGeneration) refreshVisibleLibrary();
            });
            pages.addEventListener('onBeforeClose', () => {
                if (generation !== readerGeneration) return;
                // The gallery fades out before removing its overlay. Ignore clicks during that fade
                // so its thumbnail module cannot receive a second close event.
                const outer = document.querySelector('.lg-outer');
                if (outer) outer.style.pointerEvents = 'none';
            });
            output.append(hint, pages);
            for (const [index, blob] of blobs.entries()) {
                if (index && index % 20 === 0) {
                    await new Promise((resolve) => setTimeout(resolve, 0));
                    if (generation !== readerGeneration) return;
                }
                const url = URL.createObjectURL(blob);
                objectUrls.push(url);
                const link = document.createElement('a');
                link.href = url;
                const image = document.createElement('img');
                image.className = 'imgUrl';
                image.alt = `Page ${objectUrls.length}`;
                image.src = url;
                link.appendChild(image);
                pages.appendChild(link);
            }
            saveReading(context);
            highlightPage(context.page);
            galleryClickHandler = (event) => {
                const link = event.target.closest('#output a');
                if (!link) return;
                event.preventDefault();
                document.removeEventListener('click', galleryClickHandler);
                lightGallery(pages, {
                    selector: 'a', zoom: true, fullScreen: true, download: false, enableTouch: true,
                    thumbnail: true, animateThumb: true, showThumbByDefault: true,
                    autoplay: false, autoplayControls: true, rotate: true
                });
                link.click();
            };
            document.addEventListener('click', galleryClickHandler);
            output.style.display = 'block';
            if (context.libraryId && context.page > 0) {
                setTimeout(() => {
                    if (generation === readerGeneration) output.querySelectorAll('a')[context.page]?.scrollIntoView({ behavior: 'smooth', block: 'center' });
                }, 200);
            }
            if (context.libraryId) {
                thumbnailFromBlob(blobs[0]).then((thumbnail) => {
                    if (generation !== readerGeneration) return;
                    const library = libraryById(context.libraryId);
                    const saved = library?.history[context.name];
                    if (!saved) return;
                    saved.thumbnail = thumbnail;
                    if (!library.cover) library.cover = thumbnail;
                    saveState();
                    refreshVisibleLibrary();
                }).catch((error) => console.info('Could not generate thumbnail:', error));
            }
        } catch (error) {
            if (generation !== readerGeneration) return;
            const message = document.createElement('p');
            message.textContent = error.message === 'No images'
                ? 'This archive contains no supported images.'
                : 'Could not open this comic. The file may be damaged or unsupported.';
            console.error('Could not open comic:', error);
            output.appendChild(message);
            output.style.display = 'block';
        } finally {
            if (generation === readerGeneration) loading.style.display = 'none';
        }
    }

    function saveReading(context) {
        const library = libraryById(context.libraryId);
        if (!library || !context.totalPages) return;
        const previous = library.history[context.name];
        library.history[context.name] = {
            last_page: context.page, total_pages: context.totalPages,
            timestamp: Date.now(), thumbnail: previous?.thumbnail || null
        };
        saveState();
    }

    function refreshVisibleLibrary() {
        if (wrap.classList.contains('collapsed')) return;
        if (currentView === 'home') renderHome();
        else if (currentView === 'library') renderLibrary();
    }

    function clearReader() {
        ++comicRequest;
        ++readerGeneration;
        reading = null;
        if (archiveReader) {
            archiveReader.abort();
            archiveReader = null;
        }
        if (galleryClickHandler) document.removeEventListener('click', galleryClickHandler);
        const galleryInstance = window.lgData?.[galleryElement?.getAttribute('lg-uid')];
        if (galleryInstance?.destroy) galleryInstance.destroy(true);
        galleryElement = null;
        objectUrls.forEach((url) => URL.revokeObjectURL(url));
        objectUrls = [];
        output.replaceChildren();
        output.style.display = 'none';
        document.querySelector('.se-pre-con').style.display = 'none';
        wrap.classList.remove('reading');
    }

    function updateReaderToggle() {
        const collapsed = wrap.classList.contains('collapsed');
        // With the panel open its destination is already on screen, so name the action instead.
        el('readerBackBtn').textContent = collapsed ? el('readerBackBtn').dataset.label : '✕ Close comic';
        el('readerToggleBtn').textContent = collapsed ? `Show ${currentView === 'quick' ? 'Quick Read' : currentView === 'library' ? 'collection' : 'library'}` : 'Hide';
        el('readerToggleBtn').setAttribute('aria-expanded', String(!collapsed));
    }

    function highlightPage(index) {
        output.querySelectorAll('a').forEach((link, position) => link.classList.toggle('last-read', !!reading?.libraryId && position === index));
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
