<?php
$comicsDirectory = './comics'; // Path to your comics directory
$allowedExtensions = ['.cbr', '.cbz', '.cbt', '.cba', '.cb7'];
$cbzFiles = [];

if (is_dir($comicsDirectory)) {
    $files = scandir($comicsDirectory);
    
    foreach ($files as $file) {
        $fileExtension = strtolower(pathinfo($file, PATHINFO_EXTENSION));
        if (in_array('.' . $fileExtension, $allowedExtensions)) {
            $cbzFiles[] = $file;
        }
    }
}

echo json_encode($cbzFiles); // Return the list of CBZ files as a JSON array
?>
