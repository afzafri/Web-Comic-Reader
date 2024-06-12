document.addEventListener('DOMContentLoaded', () => {

    const outputElement = document.getElementById('output');
    const progressTextElement = document.querySelector('.progress-text');
    const sePreConElement = document.querySelector('.se-pre-con');
    const readNowButtons = document.querySelectorAll('.readNow');
    const currYearElement = document.getElementById('currYear');
    const tabButtons = document.querySelectorAll('#tab');
    const allTabButtons = document.querySelectorAll('.tab-button');
    const allOptions = document.querySelectorAll('.option');

    // tab switch
    tabButtons.forEach(tab => {
        tab.addEventListener('click', () => {
            // reset all
            outputElement.style.display = 'none';
            allTabButtons.forEach(button => button.classList.remove('active'));
            allOptions.forEach(option => option.style.display = 'none');

            // set active
            const currentID = tab.getAttribute('tab');
            tab.classList.add('active');
            document.getElementById(currentID).style.display = 'block';
        });
    });

    // current year
    currYearElement.innerHTML = (new Date()).getFullYear();

    // Load all the archive formats
    loadArchiveFormats(['rar', 'zip', 'tar']);

    // ----- OPEN COMIC FROM COMPUTER -----
    let dropzone = new Dropzone("div#dropzone", {
        url: '#', // Dummy URL, not used since you're not uploading files
        dictDefaultMessage: 'Click or Drop files here to upload <br> <i>(cbr,cbz,cbt files only)</i>',
        autoProcessQueue: false, // Disable automatic uploads
        disablePreviews: false,
        createImageThumbnails: false,
        acceptedFiles: '.cbr,.cbz,.cbt',
        maxFiles: 1,
        maxfilesexceeded: function(file) {
            this.removeAllFiles();
        },
        init: function () {
            this.on('addedfile', function (file) {
                // Handle the dropped file here
                openComic(file);
            });
        }
    });

    // ----- OPEN COMIC FROM INTERNAL FILE IN SERVER -----
    readNowButtons.forEach(button => {
        button.addEventListener('click', () => {
            // get the comic file name
            const comictitle = button.getAttribute('comic_title');

            // disable loading other comic while loading
            toggleReadNow();

            fetch("./comics/" + comictitle)
                .then(response => {
                    if (!response.ok) {
                        throw new Error("Network response was not ok " + response.statusText);
                    }
                    return response.blob();
                })
                .then(blob => {
                    const file = new File([blob], comictitle);
                    // open the comic
                    openComic(file);
                })
                .catch(error => {
                    console.error("There was a problem with the fetch operation:", error);
                    toggleReadNow(false); // re-enable the button if there is an error
                });
        });
    });

    function toggleReadNow(disable = true) {
        readNowButtons.forEach(button => {
            button.disabled = disable;
        });
    }

    function openComic(file) {
        outputElement.style.display = 'none';

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
                outputElement.innerHTML = `<font color='red'>${err}</font><br>`;

                // hide loading
                sePreConElement.style.display = 'none';

                // show output box
                outputElement.style.display = 'block';
                
                // re-enable read now
                toggleReadNow(false);
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
                    progressTextElement.innerHTML = "<font color='lime'>Completed!</font>";
                    sePreConElement.style.display = 'none';
                    outputElement.style.display = 'block';
                    toggleReadNow(false);
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
