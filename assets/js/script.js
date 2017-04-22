$(document).ready(function(){
    
    // hide the output box first
    $('#output').hide();
   
    // Load all the archive formats
	loadArchiveFormats(['rar', 'zip', 'tar']);
    
    $("#fileup").change(function(){
        
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
                $('#output').append("<b>"+archive.file_name+"</b><br><i>Click on the image to enlarge</i><br><br>");
                readContents(archive);
                
                // hide loading
                $('.se-pre-con').fadeOut('slow');
                
                // show output box
                $('#output').fadeIn('slow');
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
    
});