// Assuming you have a PHP script named get_cbz_files.php
fetch('./get_cbz_files.php')
    .then(response => response.json())
    .then(data => {
        // Use the data to dynamically generate the buttons
        const comicButtonsContainer = document.getElementById('comicButtons');

        data.forEach(fileName => {
            const button = document.createElement('button');
            button.className = 'readNow';
            button.setAttribute('comic_title', fileName);

            const img = document.createElement('img');
            img.src = comicsFolder + 'comic_strip_thumb.jpg'; // Use the same thumbnail for all comics

            const br = document.createElement('br');

            const text = document.createTextNode(fileName);

            button.appendChild(img);
            button.appendChild(br);
            button.appendChild(text);

            button.addEventListener('click', () => {
                displayComic(fileName);
            });

            comicButtonsContainer.appendChild(button);
        });
    })
    .catch(error => {
        console.error('Error fetching CBZ files:', error);
    });
