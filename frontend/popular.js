document.addEventListener('DOMContentLoaded', function() {
    loadPopularSongs();
});

async function loadPopularSongs() {
    const container = document.createElement('div');
    container.className = 'player';
    document.body.insertBefore(container, document.querySelector('.back-link'));
    try {
        const response = await fetch('/api/songs?category=pop');
        const songs = await response.json();
        if (!songs || songs.length === 0) {
            container.innerHTML = `<h3 style='text-align:center;color:#ffd6ff;'>No popular songs available.</h3>`;
            return;
        }
        container.innerHTML = songs.map(song => `
            <div class="track">
                <div class="track-img-wrapper">
                    <img src="${song.imageUrl}" alt="${song.name}" />
                    <span class="play-overlay"><i class="fas fa-play"></i></span>
                </div>
                <div class="track-info">
                    <h4>${song.name}</h4>
                    <p>${song.artist}</p>
                    <audio controls src="${song.audioUrl}"></audio>
                </div>
            </div>
        `).join('');
    } catch (error) {
        container.innerHTML = `<h3 style='text-align:center;color:#ffd6ff;'>Failed to load popular songs.</h3>`;
    }
}
