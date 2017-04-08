$(document).ready(function(){
   
    // Load all the archive formats
	loadArchiveFormats(['rar', 'zip', 'tar']);
    
    $("#fileup").change(function(){
        var file = $(this)[0].files[0];
        
        // Open the file as an archive
        archiveOpenFile(file, function(archive, err) {
            if (archive) 
            {
               console.log(archive);
            } 
            else 
            {
                console.log(err);
            }
        });
        
    });
    
});