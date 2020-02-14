$(document).ready(function(){

		// tab switch
		$(document).on('click', '#tab', function() {
			// reset all
			$('#output').hide();
			$('.tab-button').removeClass('active');
			$('.option').hide();

			// set active
			var currentID = $(this).attr('tab');
			$(this).addClass('active');
			$('#'+currentID).show();
		});

		// current year
		$('#currYear').html((new Date()).getFullYear());

    // Load all the archive formats
		loadArchiveFormats(['rar', 'zip', 'tar']);

		// ----- OPEN COMIC FROM COMPUTER -----
    $("#fileup").change(function(){
			if($(this)[0].files.length == 0) {
				$('#output').html("<font color='red'>Please choose a comic file</font><br>");
			} else {
				var file = $(this)[0].files[0];
				// open the comic
				openComic(file);
			}
    });

		// ----- OPEN COMIC FROM INTERNAL FILE IN SERVER -----
		$(document).on('click', '#readNow', function() {
			// get the comic file name
			var comictitle = $(this).attr('comic_title');

			var blob = null;
			var xhr = new XMLHttpRequest();
			xhr.open("GET", "/comics/"+comictitle); // make sure to put all the comics inside "comics" directory in the root directory
			xhr.responseType = "blob";
			xhr.onload = function()
			{
			    blob = xhr.response;
					var file = new File([blob], comictitle);
					// open the comic
					openComic(file);
			}
			xhr.send();
		});

		function openComic(file)
		{
				$('#output').hide();

				// init the gallery plugin, when there is a first click on a image
				// re-bind this function when opening new comic
				$(document).one('click','#comicImg',function(){
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
				$('.progress-text').html("Reading 0/0 pages");

				// show loading
				$('.se-pre-con').fadeIn('slow');

				// destroy lightGallery
				var $lg = $('#output');
				$lg.lightGallery();
				$lg.data('lightGallery').destroy(true);

				// clear previous blobs
				clearBlobs();

				// clear previous output data
				$('#output').empty();

				// Open the file as an archive
				archiveOpenFile(file, function(archive, err) {
					if (archive)
					{
						$('#output').append("<b>"+archive.file_name+"</b><br><i>Click on the image to enlarge</i><br><br>");
						readContents(archive);
					}
					else
					{
						$('#output').append("<font color='red'>"+err+"</font><br>");

						// hide loading
						$('.se-pre-con').fadeOut('slow');

						// show output box
						$('#output').fadeIn('slow');
					}
				});
		}

    // function for reading the contents of the archive
    function readContents(archive)
    {
        var entries = archive.entries;

        // iterate through all the contents
        for(var i=0;i<entries.length;i++)
        {
			processEntries(entries, i, entries.length);
        }
    }

	// implement setTimout()
	// This can minimize browser from overprocessing and end up freezing
	// simple way to mimics multi threading
	function processEntries(entries, i, max)
	{
		setTimeout(function() {
			filename = entries[i].name;
			// check, only output file, not folder
			if(getExt(filename) != '')
			{
				// call function to create blob and url. allow us to read/view the contents
				createBlobs(entries[i], i, max);
			}
		}, i*700);
	}

    // function to return file extension based on file name
    function getExt(filename)
    {
        var ext = filename.split('.').pop();
        return (ext == filename) ? '' : ext;
    }

    // function to return MIME type based on the file extension
    // NOTE: THIS FUNCTION IS NOT EFFICIENT
    function getMIME(filename)
    {
        var ext = getExt(filename).toLowerCase();

        switch(ext)
        {
            case 'jpg':
            case 'jpeg':
                return 'image/jpeg';
                break;
            case 'png':
                return 'image/png';
                break;
            case 'gif':
                return 'image/gif';
                break;
            case 'bmp':
                return 'image/bmp';
                break;
            case 'webp':
                return 'image/webp';
                break;
            default:
                return 'image/jpeg';
        }
    }

    // function to convert the archive contents into blobs, and return URL
    function createBlobs(entry, i, max)
    {
        entry.readData(function(data, err) {
            // Convert the data into an Object URL
            var blob = new Blob([data], {type: getMIME(entry.name)});
            var url = URL.createObjectURL(blob);

            // output the images
            $('#output').append("<a href='"+url+"' id='comicImg'><img src='"+url+"' class='imgUrl'/></a>");

			// Update progress text
			$('.progress-text').html("Reading "+i+"/"+max+" pages");

			// only hide loading spinnder when done process all
			if(i == (max-1)) {
				$('.progress-text').html("<font color='lime'>Completed!</font>");

				// hide loading
                $('.se-pre-con').fadeOut('slow');

                // show output box
                $('#output').fadeIn('slow');
			}
        });
    }

    // function to clear all previous blobs, free up memory
    function clearBlobs()
    {
        $('.imgUrl').each(function(){
            URL.revokeObjectURL($(this).attr('src'));
        });
    }

});
