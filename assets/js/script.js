$(document).ready(function(){
   
    // Load all the archive formats
	loadArchiveFormats(['rar', 'zip', 'tar']);
    
    $("#fileup").change(function(){
        // clear previous output data
        $('#output').empty();
        
        var file = $(this)[0].files[0];
        
        // Open the file as an archive
        archiveOpenFile(file, function(archive, err) {
            if (archive) 
            {
                $('#output').append("<b>"+archive.file_name+"</b><br>");
                readContents(archive);
            } 
            else 
            {
                console.log(err);
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
            if(getExt(filename))
            {
                // call function to create blob and url. allow us to read/view the contents
                createBlobs(entries[i]);
            }
        }
    }
    
    // function to determine if content is file or folder. return true if a file
    function getExt(filename)
    {
        var ext = filename.split('.').pop();
        return (ext == filename) ? false : true;
    }
    
    // function to convert the archive contents into blobs, and return URL
    function createBlobs(entry)
    {
        entry.readData(function(data, err) {
            // Convert the data into an Object URL
            var blob = new Blob([data], {type: 'image/jpeg'});
            var url = URL.createObjectURL(blob);
            
            // output the url
            $('#output').append("#File: <a href='"+url+"' target='_blank'>"+entry.name+"</a><br>");
        });
        
    }
    
});