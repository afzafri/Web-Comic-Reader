document.addEventListener('DOMContentLoaded', () => {

    const outputElement = document.getElementById('output');
    const progressTextElement = document.querySelector('.progress-text');
    const sePreConElement = document.querySelector('.se-pre-con');
    const currYearElement = document.getElementById('currYear');
    const wrapElement = document.querySelector('.wrap');
    const collapseBtn = document.getElementById('collapseBtn');

    // current year
    currYearElement.innerHTML = (new Date()).getFullYear();

    // Load all the archive formats
    loadArchiveFormats(['rar', 'zip', 'tar']);

    // click on collapsed footer to expand uploader
    document.querySelector('.footer-collapsed').addEventListener('click', () => {
        wrapElement.classList.remove('collapsed');
    });

    // click collapse button to hide uploader
    collapseBtn.addEventListener('click', (e) => {
        e.preventDefault();
        wrapElement.classList.add('collapsed');
    });

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

    function openComic(file) {
        outputElement.style.display = 'none';
        wrapElement.classList.add('collapsed');
        collapseBtn.classList.add('show');
        currentComicFilename = file.name;

        // init the gallery plugin, when there is a first click on a image
        // re-bind this function when opening new comic
        // TODO: remove jquery code. Dependency: lightGallery
        $(document).one('click','#comicImg',function(event){
            event.preventDefault();

            // initialize gallery
            const $gallery = $('#output').lightGallery({
                selector: 'a',
                zoom: true,
                fullScreen: true,
                download: false,
                enableTouch: true
            });

            // track page changes
            $gallery.on('onAfterSlide.lg', function(event, prevIndex, index) {
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

            $(this).click();
        });

        // Update progress text
        progressTextElement.innerHTML = "Reading 0/0 pages";

        // show loading
        sePreConElement.style.display = 'block';

        // destroy lightGallery
        // TODO: remove jquery code. Dependency: lightGallery
        var $lg = $('#output');
        $lg.lightGallery();
        $lg.data('lightGallery').destroy(true);

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
                img.src = url;
                img.classList.add('imgUrl');

                a.appendChild(img);
                outputElement.appendChild(a);

                progressTextElement.innerHTML = `Reading ${i + 1}/${max} pages`;

                if (i === max - 1) {
                    progressTextElement.innerHTML = '<span style="color: #4ade80;">Completed!</span>';
                    sePreConElement.style.display = 'none';
                    outputElement.style.display = 'block';

                    // highlight last read page
                    setTimeout(() => {
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

    function saveLastPageRead(filename, pageIndex) {
        try {
            const readingHistory = JSON.parse(localStorage.getItem('comic_reader_userpref') || '{}');
            readingHistory[filename] = {
                last_page: pageIndex,
                timestamp: Date.now()
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
});
