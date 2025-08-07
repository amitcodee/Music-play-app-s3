const express = require('express');
const cors = require('cors');
const multer = require('multer');
const { S3Client, DeleteObjectCommand, GetObjectCommand } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
const { Upload } = require('@aws-sdk/lib-storage');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '../frontend')));
// Serve uploaded files statically
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Create uploads directory if it doesn't exist
const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
    fs.mkdirSync(path.join(uploadsDir, 'audio'), { recursive: true });
    fs.mkdirSync(path.join(uploadsDir, 'images'), { recursive: true });
}

const s3Client = new S3Client({
    region: process.env.AWS_REGION,
    credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    },
});

const BUCKET_NAME = process.env.S3_BUCKET_NAME;

let songs = [];
let stats = { totalPlays: 0, totalDownloads: 0 };

const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 10 * 1024 * 1024 }
});

async function saveFile(file, filename, folder) {
    const filePath = path.join(__dirname, 'uploads', folder, filename);
    await fs.promises.writeFile(filePath, file.buffer);
    return `/uploads/${folder}/${filename}`;
}

async function uploadToS3(file, key) {
    try {
        const uploader = new Upload({
            client: s3Client,
            params: {
                Bucket: BUCKET_NAME,
                Key: key,
                Body: file.buffer,
                ContentType: file.mimetype,
                // No ACL needed - using signed URLs instead
            },
        });
        const result = await uploader.done();
        
        // Generate a signed URL that's valid for 7 days
        const command = new GetObjectCommand({
            Bucket: BUCKET_NAME,
            Key: key,
        });
        
        const signedUrl = await getSignedUrl(s3Client, command, { expiresIn: 604800 }); // 7 days
        return signedUrl;
    } catch (error) {
        console.error('S3 upload failed:', error.message);
        return null; // Return null if S3 upload fails
    }
}

async function generateSignedUrl(key) {
    const command = new GetObjectCommand({
        Bucket: BUCKET_NAME,
        Key: key,
    });
    return await getSignedUrl(s3Client, command, { expiresIn: 604800 }); // 7 days
}

// Routes
app.get('/api/songs', async (req, res) => {
    try {
        const { category } = req.query;
        let filteredSongs = category && category !== 'all' 
            ? songs.filter(song => song.category === category)
            : songs;
        
        // Refresh signed URLs if they're close to expiring (older than 6 days)
        const refreshPromises = filteredSongs.map(async (song) => {
            const uploadDate = new Date(song.uploadDate);
            const daysSinceUpload = (Date.now() - uploadDate.getTime()) / (1000 * 60 * 60 * 24);
            
            if (daysSinceUpload > 6) {
                // Refresh URLs
                const [newAudioUrl, newImageUrl] = await Promise.all([
                    generateSignedUrl(song.s3AudioKey),
                    generateSignedUrl(song.s3ImageKey)
                ]);
                
                song.audioUrl = newAudioUrl;
                song.imageUrl = newImageUrl;
                song.urlRefreshDate = new Date().toISOString();
            }
            
            return song;
        });
        
        const refreshedSongs = await Promise.all(refreshPromises);
        res.json(refreshedSongs);
    } catch (error) {
        console.error('Error fetching songs:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

app.post('/api/admin/login', (req, res) => {
    const { username, password } = req.body;
    if (username === 'admin' && password === 'admin123') {
        res.json({ success: true, message: 'Login successful' });
    } else {
        res.status(401).json({ success: false, message: 'Invalid credentials' });
    }
});

app.post('/api/admin/upload', upload.fields([
    { name: 'songFile', maxCount: 1 },
    { name: 'songImage', maxCount: 1 }
]), async (req, res) => {
    try {
        const { songName, artistName, category } = req.body;
        const songFile = req.files.songFile[0];
        const imageFile = req.files.songImage[0];
        
        const songId = uuidv4();
        const audioFilename = `${songId}.mp3`;
        const imageFilename = `${songId}.jpg`;
        const audioKey = `songs/audio/${audioFilename}`;
        const imageKey = `songs/images/${imageFilename}`;
        
        // Save files locally first (primary storage)
        const [localAudioUrl, localImageUrl] = await Promise.all([
            saveFile(songFile, audioFilename, 'audio'),
            saveFile(imageFile, imageFilename, 'images')
        ]);
        
        // Try to upload to S3 as backup (optional)
        let s3AudioUrl = null;
        let s3ImageUrl = null;
        
        try {
            [s3AudioUrl, s3ImageUrl] = await Promise.all([
                uploadToS3(songFile, audioKey),
                uploadToS3(imageFile, imageKey)
            ]);
            console.log('✅ Files uploaded to S3 successfully');
        } catch (error) {
            console.log('⚠️  S3 upload failed, using local files only:', error.message);
        }
        
        const newSong = {
            id: songId,
            name: songName,
            artist: artistName,
            category: category.toLowerCase(),
            // Use local URLs as primary, S3 as backup
            imageUrl: localImageUrl,
            audioUrl: localAudioUrl,
            // Store both URLs for flexibility
            s3AudioUrl,
            s3ImageUrl,
            s3AudioKey: audioKey,
            s3ImageKey: imageKey,
            uploadDate: new Date().toISOString()
        };
        
        songs.push(newSong);
        console.log('✅ Song uploaded successfully:', newSong.name);
        res.json({ success: true, song: newSong });
    } catch (error) {
        console.error('❌ Upload error:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

app.delete('/api/admin/songs/:id', async (req, res) => {
    try {
        const songIndex = songs.findIndex(song => song.id === req.params.id);
        if (songIndex === -1) {
            return res.status(404).json({ success: false, message: 'Song not found' });
        }
        
        const song = songs[songIndex];
        
        // Delete local files
        try {
            const audioPath = path.join(__dirname, song.audioUrl);
            const imagePath = path.join(__dirname, song.imageUrl);
            
            if (fs.existsSync(audioPath)) fs.unlinkSync(audioPath);
            if (fs.existsSync(imagePath)) fs.unlinkSync(imagePath);
            
            console.log('✅ Local files deleted');
        } catch (error) {
            console.log('⚠️  Error deleting local files:', error.message);
        }
        
        // Delete S3 files if they exist
        if (song.s3AudioKey && song.s3ImageKey) {
            try {
                await Promise.all([
                    s3Client.send(new DeleteObjectCommand({ Bucket: BUCKET_NAME, Key: song.s3AudioKey })),
                    s3Client.send(new DeleteObjectCommand({ Bucket: BUCKET_NAME, Key: song.s3ImageKey }))
                ]);
                console.log('✅ S3 files deleted');
            } catch (error) {
                console.log('⚠️  Error deleting S3 files:', error.message);
            }
        }
        
        songs.splice(songIndex, 1);
        console.log('✅ Song deleted successfully:', song.name);
        res.json({ success: true });
    } catch (error) {
        console.error('❌ Delete error:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

app.get('/api/admin/stats', (req, res) => {
    res.json({
        totalSongs: songs.length,
        totalPlays: stats.totalPlays,
        totalDownloads: stats.totalDownloads,
        todayUploads: 0
    });
});

app.post('/api/songs/:id/play', (req, res) => {
    stats.totalPlays++;
    res.json({ success: true });
});

app.post('/api/songs/:id/download', (req, res) => {
    stats.totalDownloads++;
    const song = songs.find(s => s.id === req.params.id);
    res.json({ success: true, downloadUrl: song.audioUrl });
});

// Endpoint to refresh URLs for a specific song
app.post('/api/admin/songs/:id/refresh-urls', async (req, res) => {
    try {
        const song = songs.find(s => s.id === req.params.id);
        if (!song) {
            return res.status(404).json({ success: false, message: 'Song not found' });
        }
        
        const [newAudioUrl, newImageUrl] = await Promise.all([
            generateSignedUrl(song.s3AudioKey),
            generateSignedUrl(song.s3ImageKey)
        ]);
        
        song.audioUrl = newAudioUrl;
        song.imageUrl = newImageUrl;
        song.urlRefreshDate = new Date().toISOString();
        
        res.json({ success: true, song });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

app.listen(PORT, () => {
    console.log(`🎵 Server running on http://localhost:${PORT}`);
    console.log(`📝 Admin: username="admin", password="admin123"`);
});
