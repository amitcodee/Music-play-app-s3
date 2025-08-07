const loginModal = document.getElementById('loginModal');
const adminDashboard = document.getElementById('adminDashboard');
const loginForm = document.getElementById('loginForm');
const logoutBtn = document.getElementById('logoutBtn');
const uploadForm = document.getElementById('uploadForm');

document.addEventListener('DOMContentLoaded', function() {
    checkAuth();
    setupEventListeners();
});

function setupEventListeners() {
    loginForm.addEventListener('submit', handleLogin);
    logoutBtn.addEventListener('click', handleLogout);
    uploadForm.addEventListener('submit', handleUpload);
    
    document.querySelectorAll('.nav-btn').forEach(btn => {
        btn.addEventListener('click', function() {
            document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
            this.classList.add('active');
            showSection(this.dataset.section);
        });
    });
}

function checkAuth() {
    const isLoggedIn = localStorage.getItem('adminLoggedIn') === 'true';
    if (isLoggedIn) {
        showDashboard();
    }
}

async function handleLogin(e) {
    e.preventDefault();
    const username = document.getElementById('username').value;
    const password = document.getElementById('password').value;
    
    try {
        const response = await fetch('/api/admin/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password })
        });
        
        const result = await response.json();
        
        if (result.success) {
            localStorage.setItem('adminLoggedIn', 'true');
            showDashboard();
        } else {
            alert(result.message);
        }
    } catch (error) {
        alert('Login failed');
    }
}

function handleLogout() {
    localStorage.removeItem('adminLoggedIn');
    loginModal.style.display = 'flex';
    adminDashboard.style.display = 'none';
}

function showDashboard() {
    loginModal.style.display = 'none';
    adminDashboard.style.display = 'flex';
    loadStats();
    loadSongs();
}

function showSection(section) {
    document.querySelectorAll('.admin-section').forEach(s => s.classList.remove('active'));
    document.getElementById(`${section}-section`).classList.add('active');
    
    if (section === 'songs') loadSongs();
    if (section === 'stats') loadStats();
}

async function loadStats() {
    try {
        const response = await fetch('/api/admin/stats');
        const stats = await response.json();
        
        document.getElementById('totalSongs').textContent = stats.totalSongs;
        document.getElementById('totalPlays').textContent = stats.totalPlays;
        document.getElementById('totalDownloads').textContent = stats.totalDownloads;
    } catch (error) {
        console.error('Error loading stats:', error);
    }
}

async function loadSongs() {
    try {
        const response = await fetch('/api/songs');
        const songs = await response.json();
        
        const tbody = document.getElementById('songsTableBody');
        tbody.innerHTML = songs.map(song => `
            <tr>
                <td><img src="${song.imageUrl}" alt="${song.name}" class="song-thumbnail"></td>
                <td>${song.name}</td>
                <td>${song.artist}</td>
                <td><span class="song-category">${song.category}</span></td>
                <td>
                    <button class="delete-btn" onclick="deleteSong('${song.id}')">
                        <i class="fas fa-trash"></i> Delete
                    </button>
                </td>
            </tr>
        `).join('');
    } catch (error) {
        console.error('Error loading songs:', error);
    }
}

async function handleUpload(e) {
    e.preventDefault();
    const formData = new FormData();
    formData.append('songName', document.getElementById('songName').value);
    formData.append('artistName', document.getElementById('artistName').value);
    formData.append('category', document.getElementById('category').value);
    formData.append('songImage', document.getElementById('songImage').files[0]);
    formData.append('songFile', document.getElementById('songFile').files[0]);
    
    try {
        const response = await fetch('/api/admin/upload', {
            method: 'POST',
            body: formData
        });
        
        const result = await response.json();
        
        if (result.success) {
            alert('Song uploaded successfully!');
            uploadForm.reset();
            loadStats();
            loadSongs();
        } else {
            alert(result.message);
        }
    } catch (error) {
        alert('Upload failed');
    }
}

async function deleteSong(songId) {
    if (confirm('Delete this song?')) {
        try {
            const response = await fetch(`/api/admin/songs/${songId}`, {
                method: 'DELETE'
            });
            
            const result = await response.json();
            
            if (result.success) {
                alert('Song deleted successfully!');
                loadStats();
                loadSongs();
            } else {
                alert(result.message);
            }
        } catch (error) {
            alert('Delete failed');
        }
    }
}
