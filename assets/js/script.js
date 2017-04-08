$(document).ready(function(){
   
    // Load all the archive formats
	loadArchiveFormats(['rar', 'zip', 'tar']);
    
    $("#fileup").change(function(){
        var file = $(this)[0].files[0];
        
        console.log(file);
        
    });
    
});