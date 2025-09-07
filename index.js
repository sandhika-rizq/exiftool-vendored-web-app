const express = require('express');
const multer = require('multer');
const { exiftool } = require('exiftool-vendored');
const path = require('path');
const fs = require('fs');

const app = express();

// Configure multer to handle file uploads with proper file filtering
const upload = multer({ 
  dest: 'uploads/',
  fileFilter: (req, file, cb) => {
    // Accept only JPEG files
    if (file.mimetype.startsWith('image/jpeg') || file.mimetype.startsWith('image/jpg')) {
      cb(null, true);
    } else {
      cb(new Error('Only JPEG files are allowed!'), false);
    }
  },
  limits: {
    fileSize: 50 * 1024 * 1024 // 50MB limit
  }
});

// Ensure uploads directory exists
const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// Upload route with full metadata extraction including makernotes
app.post('/upload', upload.single('image'), async (req, res) => {
  console.log('Received a file upload request.');

  if (!req.file) {
    console.log('No file was uploaded.');
    return res.status(400).json({ error: 'No file uploaded.' });
  }

  // Log details about the uploaded file
  console.log('File uploaded:', {
    originalname: req.file.originalname,
    mimetype: req.file.mimetype,
    size: req.file.size,
    path: req.file.path
  });
  
  const filePath = req.file.path;

  try {
    console.log(`Processing file: ${filePath}`);
    
    // Extract ALL metadata including makernotes with detailed options
    const tags = await exiftool.read(filePath, [
      '-all',           // Extract all tags
      '-s',             // Use tag names (no descriptions)
      '-G',             // Include group names
      '-struct',        // Enable structured output for complex tags
      '-charset',       // Handle character encoding
      'filename',       // Include filename
      '-api',           // Enable API options
      'largefilesupport=1'  // Support for large files
    ]);
    
    // Also get makernotes specifically if available
    const makernoteTags = await exiftool.read(filePath, [
      '-makernotes:all',
      '-s',
      '-G'
    ]).catch(() => null); // Don't fail if no makernotes
    
    // Combine results
    const fullMetadata = {
      basicInfo: {
        filename: req.file.originalname,
        filesize: req.file.size,
        mimetype: req.file.mimetype,
        processedAt: new Date().toISOString()
      },
      metadata: tags,
      makernotes: makernoteTags || 'No makernotes found or not readable'
    };
    
    console.log('Successfully extracted EXIF data');
    console.log('Number of tags extracted:', Object.keys(tags).length);
    
    res.json(fullMetadata);
    
  } catch (err) {
    console.error('Error reading EXIF data:', err);
    res.status(500).json({ 
      error: 'Error processing image', 
      details: err.message 
    });
  } finally {
    // Clean up the uploaded file after a delay to ensure response is sent
    setTimeout(() => {
      fs.unlink(filePath, (err) => {
        if (err) {
          console.error('Error deleting temporary file:', err);
        } else {
          console.log(`Successfully deleted temporary file: ${filePath}`);
        }
      });
    }, 1000);
  }
});

// Route for extracting metadata in human-readable format
app.post('/upload-readable', upload.single('image'), async (req, res) => {
  console.log('Received a file upload request for readable format.');

  if (!req.file) {
    console.log('No file was uploaded.');
    return res.status(400).json({ error: 'No file uploaded.' });
  }

  const filePath = req.file.path;

  try {
    console.log(`Processing file for readable format: ${filePath}`);
    
    // Extract metadata in human-readable format
    const readableTags = await exiftool.read(filePath, [
      '-all',           // Extract all tags
      '-G',             // Include group names
      '-struct',        // Enable structured output
      '-charset',       // Handle character encoding
      'filename'        // Include filename
    ]);
    
    // Format the output for better readability
    const formattedMetadata = {
      fileInfo: {
        originalFilename: req.file.originalname,
        fileSize: `${(req.file.size / 1024 / 1024).toFixed(2)} MB`,
        mimeType: req.file.mimetype,
        processedAt: new Date().toLocaleString()
      },
      metadata: readableTags
    };
    
    console.log('Successfully extracted readable EXIF data');
    res.json(formattedMetadata);
    
  } catch (err) {
    console.error('Error reading EXIF data:', err);
    res.status(500).json({ 
      error: 'Error processing image', 
      details: err.message 
    });
  } finally {
    // Clean up the uploaded file
    setTimeout(() => {
      fs.unlink(filePath, (err) => {
        if (err) {
          console.error('Error deleting temporary file:', err);
        } else {
          console.log(`Successfully deleted temporary file: ${filePath}`);
        }
      });
    }, 1000);
  }
});

// Error handling middleware for multer
app.use((error, req, res, next) => {
  if (error instanceof multer.MulterError) {
    if (error.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({ error: 'File too large. Maximum size is 50MB.' });
    }
  }
  if (error.message === 'Only JPEG files are allowed!') {
    return res.status(400).json({ error: 'Only JPEG files are allowed!' });
  }
  res.status(500).json({ error: 'An unexpected error occurred.' });
});

// It's a good practice to close the exiftool process when the app exits
process.on('exit', () => {
    console.log('Closing exiftool...');
    exiftool.end();
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  // Log the server start message
  console.log(`Server is running and listening on port ${PORT} 🚀`); // 👈 DEBUG
});