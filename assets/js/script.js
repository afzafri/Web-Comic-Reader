document.addEventListener('DOMContentLoaded', () => {

    const outputElement = document.getElementById('output');
    const progressTextElement = document.querySelector('.progress-text');
    const sePreConElement = document.querySelector('.se-pre-con');
    const currYearElement = document.getElementById('currYear');
    const wrapElement = document.querySelector('.wrap');

    // current year
    currYearElement.innerHTML = (new Date()).getFullYear();

    // Load all the archive formats
    loadArchiveFormats(['rar', 'zip', 'tar']);

    // click on collapsed footer to expand uploader
    document.querySelector('.footer-collapsed').addEventListener('click', () => {
        wrapElement.classList.remove('collapsed');
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

    function openComic(file) {
        outputElement.style.display = 'none';
        wrapElement.classList.add('collapsed');

        // init the gallery plugin, when there is a first click on a image
        // re-bind this function when opening new comic
        // TODO: remove jquery code. Dependency: lightGallery
        $(document).one('click','#comicImg',function(event){
            event.preventDefault();
            // initialize gallery
            $('#output').lightGallery({
                selector: 'a',
                zoom: true,
                fullScreen: true,
                download: false,
                enableTouch: true,
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
});
