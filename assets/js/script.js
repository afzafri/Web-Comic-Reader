document.addEventListener('DOMContentLoaded', () => {
    const el = (id) => document.getElementById(id);
    const i18n = window.ComicReaderI18n;
    const t = i18n.t;
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
    let lastNotice = null;
    let pendingConfirmation = null;
    let dropzone = null;
    let state = readState();
    let activeLibraryId = null;
    let currentView = 'home';
    let pendingSelection = null;
    let busy = false;
    let rootGeneration = 0;
    let reading = null;
    let comicRequest = 0;
    let readerGeneration = 0;
    let gallery = null;
    let galleryElement = null;
    let galleryClickHandler = null;
    let galleryObserver = null;
    let objectUrls = [];

    el('currYear').textContent = new Date().getFullYear();
    loadArchiveFormats(['rar', 'zip', 'tar']);
    applyLanguage();
    el('languageSelect').addEventListener('change', (event) => {
        const saved = i18n.setLanguage(event.target.value);
        applyLanguage();
        renderHome();
        if (currentView === 'library') renderLibrary();
        if (!saved) notify('languageSaveFailed', {}, 'error');
    });
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
    el('collapseBtn').addEventListener('click', () => {
        wrap.classList.add('collapsed');
        placeLanguageControl();
    });
    document.querySelector('.footer-collapsed').addEventListener('click', () => {
        wrap.classList.remove('collapsed');
        placeLanguageControl();
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
            for (const file of files) {
                const parts = file.webkitRelativePath.split('/');
                if (parts.length < 3) continue; // Ignore loose files in the root.
                if (!groups.has(parts[1])) groups.set(parts[1], { handle: null, files: new Map() });
                // Root / collection / comic only; deeper folders are not recursively scanned.
                if (parts.length === 3 && isComic(file.name)) groups.get(parts[1]).files.set(file.name, file);
            }
            await acceptRoot(name, groups, null, selection.openAfter);
        } catch (error) {
            notify('scanFailed');
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
        if (wasReconnecting) notify('selectionCanceled', { name: state.root.name });
    });

    if (window.Dropzone) {
        Dropzone.autoDiscover = false;
        dropzone = new Dropzone('#dropzone', {
            url: '#', acceptedFiles: '.cbr,.cbz,.cbt', createImageThumbnails: false,
            autoProcessQueue: false, previewsContainer: false, maxFiles: 1,
            init: function() {
                this.on('addedfile', (file) => {
                    if (!isComic(file.name) || file.size > this.options.maxFilesize * 1024 * 1024) return;
                    openComic(file); // Quick Read never writes collection progress.
                    this.removeFile(file);
                });
                this.on('error', (file) => {
                    notify(!isComic(file.name) ? 'invalidFile'
                        : file.size > this.options.maxFilesize * 1024 * 1024 ? 'uploadTooLarge' : 'uploadFailed', {}, 'error');
                    this.removeFile(file);
                });
            }
        });
        applyLanguage();
    }

    renderHome();
    initialize().catch((error) => {
        disconnectRoot();
        rootAccess.needsPicker = true;
        console.error('Could not restore the comics root:', error);
        notify('restoreFailed');
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
            notify('storageReadFailed');
        }
        return { version: 3, root: null, libraries: [], removedFolders: [], legacyImported: false };
    }

    function saveState() {
        try {
            localStorage.setItem(storageKey, JSON.stringify(state));
            return true;
        } catch (error) {
            console.error('Could not save collections:', error);
            notify('storageSaveFailed');
            return false;
        }
    }

    function notify(key, params = {}, kind = /Failed$|Denied$/.test(key) ? 'error' : 'info') {
        lastNotice = key ? { key, params, kind } : null;
        renderNotice();
    }

    function renderNotice() {
        el('appMessage').hidden = !lastNotice;
        el('appMessage').dataset.kind = lastNotice?.kind || 'info';
        el('appMessageText').textContent = lastNotice ? t(lastNotice.key, lastNotice.params) : '';
    }

    function applyLanguage() {
        document.documentElement.lang = i18n.language;
        document.title = t('pageTitle');
        el('languageSelect').value = i18n.language;
        document.querySelectorAll('[data-i18n]').forEach((node) => { node.textContent = t(node.dataset.i18n); });
        document.querySelectorAll('[data-i18n-aria]').forEach((node) => { node.setAttribute('aria-label', t(node.dataset.i18nAria)); });
        el('browserNotice').hidden = supportsPersistentAccess;
        el('browserNotice').textContent = t(canSelectFolders ? 'sessionNotice' : 'noFolders');
        el('footerCollapsedText').textContent = t(currentView === 'quick' ? 'quickRead' : currentView === 'library' ? 'showCollection' : 'showLibrary');
        document.querySelectorAll('#output img[data-page]').forEach((image) => {
            image.alt = t('page', { page: image.dataset.page });
        });
        output.style.setProperty('--last-read-label', JSON.stringify(t('lastReadBadge')));
        if (dropzone) {
            dropzone.options.dictInvalidFileType = t('invalidFile');
            dropzone.options.dictFileTooBig = t('uploadTooLarge');
            dropzone.options.dictResponseError = t('uploadFailed');
        }
        renderNotice();
        renderConfirmation();
        localizeGallery();
    }

    function localizeGallery() {
        const labels = {
            '.lg-close': 'readerClose', '.lg-next': 'readerNext', '.lg-prev': 'readerPrevious',
            '.lg-fullscreen': 'readerFullscreen', '#lg-zoom-in': 'readerZoomIn', '#lg-zoom-out': 'readerZoomOut',
            '#lg-actual-size': 'readerActualSize', '.lg-toogle-thumb': 'readerThumbnails',
            '.lg-autoplay-button': 'readerAutoplay', '#lg-rotate-left': 'readerRotateLeft',
            '#lg-rotate-right': 'readerRotateRight', '#lg-flip-hor': 'readerFlipHorizontal', '#lg-flip-ver': 'readerFlipVertical'
        };
        for (const [selector, key] of Object.entries(labels)) {
            document.querySelectorAll(`.lg-outer ${selector}`).forEach((node) => {
                node.title = t(key);
                node.setAttribute('aria-label', t(key));
            });
        }
        document.querySelectorAll('.lg-outer .lg-error-msg').forEach((node) => {
            if (node.textContent !== t('readerLoadFailed')) node.textContent = t('readerLoadFailed');
        });
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
    function getMIME(name) {
        const types = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png',
            gif: 'image/gif', bmp: 'image/bmp', webp: 'image/webp' };
        return types[name.split('.').pop().toLowerCase()] || 'image/jpeg';
    }
    function newId() {
        return crypto.randomUUID ? crypto.randomUUID() : `library-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    }
    function newLibrary(name) {
        return { id: newId(), name, folderName: name, inRoot: true, comics: [], history: {}, cover: null };
    }

    function confirmCollectionAction(title, description, consequence, label, params = {}) {
        if (pendingConfirmation) return Promise.resolve(false);
        return new Promise((resolve) => {
            pendingConfirmation = { title, description, consequence, label, params, resolve, focus: document.activeElement };
            renderConfirmation();
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

    function renderConfirmation() {
        if (!pendingConfirmation) return;
        const { title, description, consequence, label, params } = pendingConfirmation;
        el('collectionDialogTitle').textContent = t(title, params);
        el('collectionDialogDescription').textContent = t(description, params);
        el('collectionDialogConsequence').textContent = t(consequence, params);
        el('confirmCollectionActionBtn').textContent = t(label);
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
        const confirmed = await confirmCollectionAction('removeTitle', 'removeDescription',
            hasAnother ? 'removeDuplicate' : library.inRoot ? 'removePresent' : 'removeMissing',
            'removeCollection', { name: library.name });
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
            notify('removeFailed', { name: library.name }, 'error');
            return;
        }
        access.delete(id);
        if (activeLibraryId === id) { activeLibraryId = null; showHome(); }
        else renderHome();
        notify('removed', { name: library.name }, 'success');
        el(state.removedFolders.length ? 'rediscoverCollectionsBtn' : 'selectRootBtn').focus();
    }

    async function confirmRediscovery() {
        if (busy || !state.removedFolders.length) return;
        const confirmed = await confirmCollectionAction('rediscoverTitle', 'rediscoverNames',
            'rediscoverDescription', 'allowRediscovery', { names: state.removedFolders.join(', ') });
        if (confirmed && !busy) {
            const previous = state.removedFolders;
            state.removedFolders = [];
            if (!saveState()) {
                state.removedFolders = previous;
                notify('rediscoverSaveFailed');
                return;
            }
            renderHome();
            notify('rediscoverReady');
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
            notify('handleSaveFailed');
            return false;
        }
    }

    async function groupsFromHandle(root) {
        const groups = new Map();
        for await (const entry of root.values()) {
            if (entry.kind !== 'directory') continue;
            const files = new Map();
            for await (const comic of entry.values()) {
                if (comic.kind === 'file' && isComic(comic.name)) files.set(comic.name, await comic.getFile());
            }
            groups.set(entry.name, { handle: entry, files });
        }
        return groups;
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
                comics: Array.from(group.files.values(), (file) => ({ name: file.name, size: file.size }))
                    .sort((a, b) => a.name.localeCompare(b.name, i18n.language, { numeric: true })) });
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
        const generation = ++rootGeneration;
        generateCovers(matches.map((match) => match.library), generation);
    }

    async function generateCovers(libraries, generation) {
        for (const library of libraries) {
            if (generation !== rootGeneration || !rootAccess.connected) return;
            if (libraryById(library.id) !== library) continue;
            await ensureCover(library);
        }
    }

    async function acceptRoot(name, groups, handle, openAfter) {
        if (state.root) {
            let sameRoot = state.root.name === name;
            if (handle && rootAccess.handle) {
                try { sameRoot = await handle.isSameEntry(rootAccess.handle); }
                catch (error) { console.info('Could not compare the previous root:', error); }
            }
            if (!sameRoot && !await confirmCollectionAction('replaceRootTitle', 'replaceRootDescription',
                'replaceRootConsequence', 'replaceRoot', { name, previous: state.root.name })) return;
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
            notify(state.root ? 'reconnectInstructions' : 'selectInstructions', { name: state.root?.name });
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
                    notify('permissionDenied');
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
                notify('accessFailed');
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
        el('footerCollapsedText').textContent = view === 'quick' ? t('quickRead') : view === 'library' ? t('showCollection') : t('showLibrary');
        wrap.classList.remove('collapsed');
        placeLanguageControl();
    }

    function placeLanguageControl() {
        const target = wrap.classList.contains('collapsed') ? 'readerHeaderActions'
            : currentView === 'library' ? 'collectionHeaderActions'
                : currentView === 'quick' ? 'quickReadHeaderActions' : 'libraryHeaderActions';
        el(target).appendChild(document.querySelector('.app-settings'));
    }
    function showHome() { setView('home'); renderHome(); }
    function showQuickRead() { setView('quick'); }
    function showLibrary(id) { activeLibraryId = id; setView('library'); renderLibrary(); }

    function historyEntries(library) {
        if (library.needsLegacyScan) return Object.entries(library.history).sort((a, b) => b[1].timestamp - a[1].timestamp);
        return library.comics.filter((comic) => library.history[comic.name])
            .map((comic) => [comic.name, library.history[comic.name]])
            .sort((a, b) => b[1].timestamp - a[1].timestamp);
    }

    function progressText(data) {
        if (!data) return t('notStarted');
        return data.total_pages ? t('pageOf', { page: Math.min(data.last_page + 1, data.total_pages), total: data.total_pages }) : t('page', { page: data.last_page + 1 });
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
        el('librarySummary').textContent = t('summary', { collections: discovered.length, comics: count }) + (savedMissing ? t('missingCount', { count: savedMissing }) : '');
        el('selectRootBtn').textContent = state.root ? t('chooseRoot') : t('selectComics');
        el('selectRootBtn').classList.toggle('primary', !state.root);
        el('reconnectRootBtn').hidden = !state.root || rootAccess.connected || !canSelectFolders;
        el('reconnectRootBtn').textContent = t('reconnectNamed', { name: state.root?.name || t('rootFolder') });
        el('rootFolderStatus').textContent = state.root
            ? `${state.root.name} · ${rootAccess.connected ? (rootAccess.handle ? t('connected') : t('sessionConnected')) : t('reconnectStatus')}`
            : t('rootInstructions');
        el('rediscoverCollectionsBtn').hidden = !state.removedFolders.length;
        el('rediscoverCollectionsBtn').textContent = t('rediscoverCount', { count: state.removedFolders.length });
        el('emptyLibraries').hidden = state.libraries.length > 0;
        el('emptyLibraries').querySelector('h2').textContent = state.removedFolders.length ? t('noSavedCollections') : state.root ? t('noCollectionsFound') : t('noCollections');
        el('emptyLibraries').querySelector('p').textContent = state.root
            ? t('emptyRoot', { name: state.root.name }) + (state.removedFolders.length ? t('emptyRootRemoved') : '')
            : t('selectInstructions');
        for (const library of [...state.libraries].sort((a, b) => Number(b.inRoot) - Number(a.inRoot) || a.name.localeCompare(b.name, i18n.language, { numeric: true }))) {
            const runtime = connection(library.id);
            const entries = historyEntries(library);
            const latest = entries[0];
            const completed = entries.filter(([, data]) => data.total_pages && data.last_page + 1 >= data.total_pages).length;
            const card = document.createElement('article');
            card.className = 'collection-card';
            const open = document.createElement('button');
            open.className = 'collection-open';
            open.setAttribute('aria-label', t('openCollection', { name: library.name }));
            open.appendChild(coverElement(library.cover || entries.find(([, data]) => data.thumbnail)?.[1].thumbnail, library.name));
            const title = document.createElement('h2');
            title.textContent = library.name;
            open.appendChild(title);
            open.addEventListener('click', () => showLibrary(library.id));
            card.appendChild(open);
            const details = document.createElement('div');
            details.className = 'collection-details';
            const status = document.createElement('span');
            status.className = `connection-status ${runtime.connected ? 'connected' : 'disconnected'}`;
            status.textContent = runtime.connected ? (rootAccess.handle ? t('connected') : t('sessionConnected'))
                : !state.root ? t('chooseParent') : !library.inRoot ? t('missingRoot') : t('reconnectRootFolder');
            details.appendChild(status);
            const stats = document.createElement('p');
            stats.className = 'collection-stats';
            stats.textContent = library.needsLegacyScan ? t('connectCount') : t('collectionStats', { count: library.comics.length, started: entries.length, finished: completed });
            details.appendChild(stats);
            const lastRead = document.createElement('p');
            lastRead.className = 'collection-last-read';
            lastRead.textContent = latest ? `${latest[0]} · ${progressText(latest[1])}\n${t('lastRead', { time: formatTimestamp(latest[1].timestamp) })}` : t('noHistory');
            details.appendChild(lastRead);
            const progress = document.createElement('progress');
            progress.max = library.comics.length || 1;
            progress.value = library.comics.reduce((total, comic) => {
                const data = library.history[comic.name];
                return total + (data?.total_pages ? Math.min((data.last_page + 1) / data.total_pages, 1) : 0);
            }, 0);
            progress.setAttribute('aria-label', t('progressLabel', { name: library.name }));
            details.appendChild(progress);
            const remove = document.createElement('button');
            remove.className = 'link-btn remove-collection-btn';
            remove.textContent = t('removeCollection');
            remove.setAttribute('aria-label', t('removeLabel', { name: library.name }));
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
        el('currentFolderName').textContent = `${t('comicsCount', { count: library.comics.length })}${state.root ? ` · ${state.root.name}` : ''} · ${runtime.connected ? (rootAccess.handle ? t('connected') : t('sessionAccess')) : t('unavailable')}`;
        el('reconnectLibraryBtn').hidden = runtime.connected;
        el('reconnectLibraryBtn').textContent = !state.root ? t('selectRoot') : rootAccess.connected ? t('rescanRoot') : t('reconnectRoot');
        el('chooseRootBtn').hidden = !canSelectFolders;
        el('libraryConnectionNotice').hidden = runtime.connected;
        el('libraryConnectionNotice').textContent = canSelectFolders
            ? !state.root ? t('librarySelectNotice')
                : !library.inRoot ? t('missingNotice', { name: state.root.name })
                : t('reconnectNotice', { name: state.root.name })
            : t('libraryUnsupported');
        const recent = historyEntries(library).slice(0, 5);
        el('recentComicsList').replaceChildren(...recent.map(([name]) => comicRow(library, name)));
        el('recentComics').style.display = recent.length ? 'block' : 'none';
        el('allComics').style.display = 'block';
        el('allComicsList').replaceChildren(...library.comics.map((comic) => comicRow(library, comic.name)));
        if (!library.comics.length) {
            const empty = document.createElement('p');
            empty.className = 'empty-comics';
            empty.textContent = library.needsLegacyScan ? t('legacyScan') : t('emptyComics');
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
                notify('reconnectComics');
            } else {
                notify('comicReadFailed');
            }
            renderHome();
            renderLibrary();
        }
    }

    function openArchive(file) {
        return new Promise((resolve, reject) => archiveOpenFile(file, (archive, error) => archive ? resolve(archive) : reject(error)));
    }
    function readEntry(entry) {
        return new Promise((resolve, reject) => entry.readData((data, error) => error ? reject(error)
            : resolve(new Blob([data], { type: getMIME(entry.name) }))));
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

    async function ensureCover(library) {
        if (library.cover || !library.comics.length) return;
        try {
            const file = await getComicFile(library, library.comics[0].name);
            const archive = await openArchive(file);
            const entry = archive.entries.find((item) => isImage(item.name));
            if (!entry) return;
            const thumbnail = await thumbnailFromBlob(await readEntry(entry));
            if (libraryById(library.id) !== library) return;
            library.cover = thumbnail;
            saveState();
            renderHome();
        } catch (error) { console.info('Cover will be generated when a comic is read:', error); }
    }

    async function openComic(file, libraryId = null) {
        clearReader();
        const context = { libraryId, name: file.name, page: libraryById(libraryId)?.history[file.name]?.last_page || 0, totalPages: 0 };
        reading = context;
        const generation = readerGeneration;
        wrap.classList.add('collapsed');
        placeLanguageControl();
        el('collapseBtn').classList.add('show');
        const progressText = document.querySelector('.progress-text');
        const loading = document.querySelector('.se-pre-con');
        progressText.textContent = t('readingComic');
        loading.style.display = 'block';
        try {
            const archive = await openArchive(file);
            if (generation !== readerGeneration) return;
            const entries = archive.entries.filter((entry) => isImage(entry.name));
            if (!entries.length) throw Object.assign(new Error('No images'), { translationKey: 'noImages' });
            const blobs = await Promise.all(entries.map(readEntry));
            if (generation !== readerGeneration) return;
            context.totalPages = blobs.length;
            context.page = Math.min(context.page, blobs.length - 1);
            const title = document.createElement('b');
            title.textContent = file.name;
            const hint = document.createElement('p');
            hint.className = 'reader-hint';
            hint.dataset.i18n = 'readerHint';
            hint.textContent = t('readerHint');
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
            pages.addEventListener('onAfterOpen', () => {
                localizeGallery();
                galleryObserver?.disconnect();
                const outer = document.querySelector('.lg-outer');
                if (outer) {
                    galleryObserver = new MutationObserver(localizeGallery);
                    galleryObserver.observe(outer, { childList: true, subtree: true });
                }
            });
            output.append(title, hint, pages);
            for (const blob of blobs) {
                const url = URL.createObjectURL(blob);
                objectUrls.push(url);
                const link = document.createElement('a');
                link.href = url;
                const image = document.createElement('img');
                image.className = 'imgUrl';
                image.dataset.page = objectUrls.length;
                image.alt = t('page', { page: objectUrls.length });
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
                gallery = lightGallery(pages, {
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
            message.dataset.i18n = error.translationKey || 'openComicFailed';
            message.textContent = t(message.dataset.i18n);
            console.error('Could not open comic:', error);
            output.appendChild(message);
            output.style.display = 'block';
        } finally {
            if (generation === readerGeneration) loading.style.display = 'none';
        }
    }

    function saveReading(context, thumbnail = null) {
        const library = libraryById(context.libraryId);
        if (!library || !context.totalPages) return;
        const previous = library.history[context.name];
        library.history[context.name] = {
            last_page: context.page, total_pages: context.totalPages,
            timestamp: Date.now(), thumbnail: thumbnail || previous?.thumbnail || null
        };
        if (!library.cover && thumbnail) library.cover = thumbnail;
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
        if (galleryClickHandler) document.removeEventListener('click', galleryClickHandler);
        galleryObserver?.disconnect();
        galleryObserver = null;
        const galleryInstance = window.lgData?.[galleryElement?.getAttribute('lg-uid')] || gallery;
        if (galleryInstance?.destroy) galleryInstance.destroy(true);
        gallery = null;
        galleryElement = null;
        objectUrls.forEach((url) => URL.revokeObjectURL(url));
        objectUrls = [];
        output.replaceChildren();
        output.style.display = 'none';
        document.querySelector('.se-pre-con').style.display = 'none';
        el('collapseBtn').classList.remove('show');
    }

    function highlightPage(index) {
        output.querySelectorAll('a').forEach((link, position) => link.classList.toggle('last-read', !!reading?.libraryId && position === index));
    }

    function formatTimestamp(timestamp) {
        const minutes = Math.max(0, Math.floor((Date.now() - timestamp) / 60000));
        if (!minutes) return t('justNow');
        const relative = new Intl.RelativeTimeFormat(i18n.language, { numeric: 'always' });
        if (minutes >= 1440) return relative.format(-Math.floor(minutes / 1440), 'day');
        if (minutes >= 60) return relative.format(-Math.floor(minutes / 60), 'hour');
        return relative.format(-minutes, 'minute');
    }
});
