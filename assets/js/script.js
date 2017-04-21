$(document).ready(function(){
   
    // Load all the archive formats
	loadArchiveFormats(['rar', 'zip', 'tar']);
    
    $("#fileup").change(function(){
        
        // init the gallery plugin, when there is a first click on a image
        // re-bind this function when opening new comic
        $(document).one('click','#comicImg',function(){
            event.preventDefault();
            // initialize gallery
            $('#output').lightGallery();
            $(this).click();
        });
        
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
        
        var file = $(this)[0].files[0];
        
        // Open the file as an archive
        archiveOpenFile(file, function(archive, err) {
            if (archive) 
            {
                $('#output').append("<b>"+archive.file_name+"</b><br>");
                readContents(archive);
                
                // hide loading
                $('.se-pre-con').fadeOut('slow');
            } 
            else 
            {
                console.log(err);
                
                // hide loading
                $('.se-pre-con').fadeOut('slow');
            }
        });
    });
    
    // function for reading the contents of the archive
    function readContents(archive)
    {
        var entries = archive.entries;
        
        // iterate through all the contents
        for(var i=0;i<entries.length;i++)
        {
            filename = entries[i].name;
            // check, only output file, not folder
            if(getExt(filename) != '')
            {
                // call function to create blob and url. allow us to read/view the contents
                createBlobs(entries[i]);
            }
        }
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
    function createBlobs(entry)
    {
        entry.readData(function(data, err) {
            // Convert the data into an Object URL
            var blob = new Blob([data], {type: getMIME(entry.name)});
            var url = URL.createObjectURL(blob);
            
            // output the images
            $('#output').append("<a href='"+url+"' id='comicImg'><img src='"+url+"' class='imgUrl'/></a>");
        });
        
    }
    
    // function to clear all previous blobs, free up memory
    function clearBlobs()
    {
        $('.imgUrl').each(function(){
            URL.revokeObjectURL($(this).attr('src'));
        });
    }
    
    // toggle full screen
    $('#btnFullscreen').click(function(){
       //toggleFullScreen(document.body); 
        toggleFullScreen();
    });
    
    
    // function for fullscreen
    // thanks http://stackoverflow.com/a/10627148/5784900
    function toggleFullScreen() {
      if ((document.fullScreenElement && document.fullScreenElement !== null) ||    
       (!document.mozFullScreen && !document.webkitIsFullScreen)) {
        if (document.documentElement.requestFullScreen) {  
          document.documentElement.requestFullScreen();  
        } else if (document.documentElement.mozRequestFullScreen) {  
          document.documentElement.mozRequestFullScreen();  
        } else if (document.documentElement.webkitRequestFullScreen) {  
          document.documentElement.webkitRequestFullScreen(Element.ALLOW_KEYBOARD_INPUT);  
        }  
      } else {  
        if (document.cancelFullScreen) {  
          document.cancelFullScreen();  
        } else if (document.mozCancelFullScreen) {  
          document.mozCancelFullScreen();  
        } else if (document.webkitCancelFullScreen) {  
          document.webkitCancelFullScreen();  
        }  
      }  
    }
    
});