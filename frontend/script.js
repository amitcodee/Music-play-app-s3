let currentSongs = [];
let currentSongIndex = -1;
let isPlaying = false;

const songsGrid = document.getElementById('songs-grid');
const audioPlayer = document.getElementById('audioPlayer');
const audioElement = document.getElementById('audioElement');
const playPauseBtn = document.getElementById('playPauseBtn');
const progressBar = document.getElementById('progressBar');
const currentTimeEl = document.getElementById('currentTime');
const durationEl = document.getElementById('duration');
const playerImage = document.getElementById('playerImage');
const playerTitle = document.getElementById('playerTitle');
const playerArtist = document.getElementById('playerArtist');

document.addEventListener('DOMContentLoaded', function() {
    loadSongs();
    setupEventListeners();
});

function setupEventListeners() {
    playPauseBtn.addEventListener('click', togglePlayPause);
    progressBar.addEventListener('input', seekAudio);
    audioElement.addEventListener('timeupdate', updateProgress);
    audioElement.addEventListener('loadedmetadata', updateDuration);
    audioElement.addEventListener('play', () => {
        isPlaying = true;
        playPauseBtn.innerHTML = '<i class="fas fa-pause"></i>';
    });
    audioElement.addEventListener('pause', () => {
        isPlaying = false;
        playPauseBtn.innerHTML = '<i class="fas fa-play"></i>';
    });

    document.querySelectorAll('.filter-btn').forEach(btn => {
        btn.addEventListener('click', function() {
            document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
            this.classList.add('active');
            loadSongs(this.dataset.category);
        });
    });
}

async function loadSongs(category = 'all') {
    try {
        // Show loading message
        songsGrid.innerHTML = `
            <div style="text-align: center; grid-column: 1 / -1; padding: 2rem;">
                <i class="fas fa-spinner fa-spin" style="font-size: 2rem; color: #667eea;"></i>
                <p style="margin-top: 1rem; color: #666;">Loading songs...</p>
            </div>
        `;
        
        const response = await fetch(`/api/songs?category=${category}`);
        
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        currentSongs = await response.json();
        console.log('Loaded songs:', currentSongs); // Debug log
        displaySongs(currentSongs);
    } catch (error) {
        console.error('Error loading songs:', error);
        songsGrid.innerHTML = `
            <div style="text-align: center; grid-column: 1 / -1; padding: 2rem;">
                <i class="fas fa-exclamation-triangle" style="font-size: 2rem; color: #e74c3c;"></i>
                <p style="margin-top: 1rem; color: #666;">Failed to load songs. Please try again.</p>
                <button onclick="loadSongs('${category}')" style="margin-top: 1rem; padding: 0.5rem 1rem; background: #667eea; color: white; border: none; border-radius: 5px; cursor: pointer;">Retry</button>
            </div>
        `;
    }
}

function displaySongs(songs) {
    if (!songs || songs.length === 0) {
        songsGrid.innerHTML = `
            <div style="text-align: center; grid-column: 1 / -1; padding: 3rem;">
                <i class="fas fa-music" style="font-size: 3rem; color: #ccc; margin-bottom: 1rem;"></i>
                <h3 style="color: #666; margin-bottom: 1rem;">No songs available</h3>
                <p style="color: #999;">Upload some songs through the admin panel to get started!</p>
                <a href="admin.html" style="display: inline-block; margin-top: 1rem; padding: 0.75rem 1.5rem; background: #667eea; color: white; text-decoration: none; border-radius: 8px;">Go to Admin Panel</a>
            </div>
        `;
        return;
    }
    
    songsGrid.innerHTML = songs.map((song, index) => `
        <div class="song-card">
            <img src="${song.imageUrl}" alt="${song.name}" class="song-image" 
                 onerror="this.src='https://via.placeholder.com/300x200/667eea/ffffff?text=🎵'">
            <div class="song-info">
                <h3>${song.name}</h3>
                <p>${song.artist}</p>
                <span class="song-category">${song.category}</span>
            </div>
            <div class="song-actions">
                <button class="action-btn" onclick="playSong(${index})">
                    <i class="fas fa-play"></i> Play
                </button>
                <button class="action-btn" onclick="downloadSong('${song.id}', '${song.name}', '${song.artist}')">
                    <i class="fas fa-download"></i> Download
                </button>
            </div>
        </div>
    `).join('');
}

function playSong(index) {
    const song = currentSongs[index];
    currentSongIndex = index;
    
    console.log('Playing song:', song); // Debug log
    
    playerTitle.textContent = song.name;
    playerArtist.textContent = song.artist;
    
    // Handle image loading with fallback
    playerImage.onerror = function() {
        this.src = 'https://via.placeholder.com/50x50/667eea/ffffff?text=🎵';
    };
    playerImage.src = song.imageUrl;
    
    audioElement.src = song.audioUrl;
    
    // Add error handling for audio
    audioElement.onerror = function() {
        console.error('Error loading audio:', song.audioUrl);
        alert('Error playing song. The audio file might not be accessible.');
    };
    
    audioElement.onloadstart = function() {
        console.log('Audio loading started for:', song.audioUrl);
    };
    
    audioElement.play().catch(error => {
        console.error('Error playing audio:', error);
        alert('Unable to play song. Please try again.');
    });
    
    audioPlayer.classList.add('active');
    
    // Track play count
    fetch(`/api/songs/${song.id}/play`, { method: 'POST' })
        .catch(error => console.error('Error tracking play:', error));
}

function togglePlayPause() {
    if (isPlaying) {
        audioElement.pause();
    } else {
        audioElement.play();
    }
}

function seekAudio() {
    const seekTime = (progressBar.value / 100) * audioElement.duration;
    audioElement.currentTime = seekTime;
}

function updateProgress() {
    if (audioElement.duration) {
        const progress = (audioElement.currentTime / audioElement.duration) * 100;
        progressBar.value = progress;
        currentTimeEl.textContent = formatTime(audioElement.currentTime);
    }
}

function updateDuration() {
    durationEl.textContent = formatTime(audioElement.duration);
}

async function downloadSong(songId, songName, artist) {
    try {
        const response = await fetch(`/api/songs/${songId}/download`, { method: 'POST' });
        const result = await response.json();
        
        if (result.success) {
            const link = document.createElement('a');
            link.href = result.downloadUrl;
            link.download = `${artist} - ${songName}.mp3`;
            link.click();
        }
    } catch (error) {
        console.error('Download error:', error);
    }
}

function formatTime(seconds) {
    if (isNaN(seconds)) return '0:00';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
}
