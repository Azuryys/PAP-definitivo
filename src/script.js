// Page Navigation Functions
function goToPlayer() {
    // Player is now a bottom bar on the starter page, no navigation needed.
    // Start playback of the first track if not already playing.
    if (window.playpauseTrack) {
        window.playpauseTrack();
    }
}

function goToStarter() {
    const starterPage = document.getElementById('starterPage');
    const setupPage = document.getElementById('setupPage');
    
    setupPage.classList.remove('active');
    starterPage.classList.add('active');
}

function goToSetup() {
    const setupPage = document.getElementById('setupPage');
    const starterPage = document.getElementById('starterPage');
    
    setupPage.classList.add('active');
    starterPage.classList.remove('active');
    
    window.initSetup();
}

/**
 * Initialize app on startup - check if setup is needed
 */
async function initApp() {
    try {
        const setupStatus = await window.electronAPI.getSetupStatus();
        
        // Always initialize the player early so getPlayerSongs / reloadSongsInPlayer are available
        window.initPlayer();

        if (!setupStatus.setupCompleted) {
            // First time setup needed
            console.log('✓ First time setup required');
            goToSetup();
        } else {
            // Setup already completed, show starter page
            console.log('✓ Setup already completed, loading starter page');
            // Starter page is already active by default in HTML

            // Check for new songs dropped into the music folder since last launch
            checkForNewSongsOnStartup();
        }
    } catch (error) {
        console.error('✗ Failed to check setup status:', error);
        // If there's an error, default to showing starter page
    }
}

/**
 * Check music folder for unimported songs on startup and show notification
 */
async function checkForNewSongsOnStartup() {
    try {
        const result = await window.electronAPI.countUnimportedSongs();
        if (result.success && result.count > 0) {
            const notif = document.getElementById('importNotification');
            const notifText = document.getElementById('importNotificationText');
            if (notif && notifText) {
                notifText.textContent = `Found ${result.count} new song(s) in your music folder.`;
                notif.style.display = '';
            }
        }
    } catch (err) {
        console.warn('Startup scan check failed:', err);
    }
}

/**
 * Handle import from the startup notification banner
 */
async function handleStartupImport() {
    const btn = document.getElementById('importNotifBtn');
    const notifText = document.getElementById('importNotificationText');
    if (btn) btn.disabled = true;
    if (notifText) notifText.textContent = 'Importing songs...';

    try {
        const result = await window.electronAPI.scanExistingSongs();
        if (result.success) {
            if (notifText) notifText.textContent = `Imported ${result.imported} song(s) successfully!`;
            if (window.reloadSongsInPlayer) await window.reloadSongsInPlayer();
        } else {
            if (notifText) notifText.textContent = 'Import failed: ' + (result.message || 'Unknown error');
        }
    } catch (err) {
        if (notifText) notifText.textContent = 'Import error: ' + err.message;
    }

    // Auto-dismiss after a short delay
    setTimeout(() => dismissImportNotification(), 2500);
}

/**
 * Dismiss the import notification banner
 */
function dismissImportNotification() {
    const notif = document.getElementById('importNotification');
    if (notif) notif.style.display = 'none';
}

window.handleStartupImport = handleStartupImport;
window.dismissImportNotification = dismissImportNotification;

function goToSettings() {
    const settingsPage = document.getElementById('settingsPage');
    const starterPage = document.getElementById('starterPage');

    starterPage.classList.remove('active');
    settingsPage.classList.add('active');

    if (window.initSettings) window.initSettings();
}

function goBackFromSettings() {
    const settingsPage = document.getElementById('settingsPage');
    const starterPage = document.getElementById('starterPage');

    settingsPage.classList.remove('active');
    starterPage.classList.add('active');
}

function goToPlugins() {
    const pluginsPage = document.getElementById('pluginsPage');
    const starterPage = document.getElementById('starterPage');
    const settingsPage = document.getElementById('settingsPage');

    starterPage.classList.remove('active');
    settingsPage.classList.remove('active');
    pluginsPage.classList.add('active');

    if (window.initPlugins) window.initPlugins();
}

function goBackFromPlugins() {
    const pluginsPage = document.getElementById('pluginsPage');
    const starterPage = document.getElementById('starterPage');

    pluginsPage.classList.remove('active');
    starterPage.classList.add('active');
}

// Make navigation functions globally accessible
window.goToPlayer = goToPlayer;
window.goToStarter = goToStarter;
window.goToSetup = goToSetup;
window.goToSettings = goToSettings;
window.goBackFromSettings = goBackFromSettings;
window.goToPlugins = goToPlugins;
window.goBackFromPlugins = goBackFromPlugins;
window.initApp = initApp;

// Modal tab switching for Create Playlist
function showPlaylistTab(tab) {
    const localTab = document.getElementById('playlistTabLocal');
    const youtubeTab = document.getElementById('playlistTabYoutube');
    const localPanel = document.getElementById('playlistTabPanelLocal');
    const youtubePanel = document.getElementById('playlistTabPanelYoutube');
    if (!localTab || !youtubeTab || !localPanel || !youtubePanel) return;
    if (tab === 'local') {
        localTab.classList.add('active');
        youtubeTab.classList.remove('active');
        localPanel.classList.add('active');
        youtubePanel.classList.remove('active');
    } else {
        localTab.classList.remove('active');
        youtubeTab.classList.add('active');
        localPanel.classList.remove('active');
        youtubePanel.classList.add('active');
    }
}
window.showPlaylistTab = showPlaylistTab;

// ── YouTube Playlist Tab Logic (Create Playlist Modal) ──────────────────────

// Store loaded playlist info for import
let loadedYoutubePlaylistInfo = null;

/**
 * Load YouTube playlist info for preview (no download yet)
 */
async function loadYoutubePlaylistInfo() {
    const urlInput = document.getElementById('youtubePlaylistUrl');
    const preview = document.getElementById('youtubePlaylistPreview');
    const editFields = document.getElementById('youtubePlaylistEditFields');
    const status = document.getElementById('youtubePlaylistStatus');
    const importBtn = document.getElementById('ytPlaylistImportBtn');
    const loadBtn = document.getElementById('ytPlaylistLoadBtn');

    if (!urlInput || !preview) return;

    const url = urlInput.value.trim();
    if (!url) {
        preview.classList.add('hidden');
        preview.innerHTML = '';
        if (editFields) editFields.classList.add('hidden');
        if (importBtn) importBtn.disabled = true;
        loadedYoutubePlaylistInfo = null;
        return;
    }

    // Show loading state
    preview.classList.remove('hidden');
    preview.innerHTML = '<div class="yt-status loading">Loading playlist info...</div>';
    if (editFields) editFields.classList.add('hidden');
    if (status) { status.classList.add('hidden'); status.innerHTML = ''; }
    if (importBtn) importBtn.disabled = true;
    if (loadBtn) loadBtn.disabled = true;

    try {
        const result = await window.electronAPI.getYoutubePlaylistInfo(url);
        if (loadBtn) loadBtn.disabled = false;

        if (result.success && result.playlist) {
            loadedYoutubePlaylistInfo = result.playlist;
            const { title, description, thumbnail, videoCount } = result.playlist;
            preview.innerHTML = `
                ${thumbnail ? `<img class="yt-thumb" src="${thumbnail}" alt="Playlist Cover">` : ''}
                <div class="yt-info">
                    <strong>${title || 'Untitled Playlist'}</strong>
                    <span>${description || ''}</span>
                    <span style="margin-top:4px;font-size:13px;color:var(--muted);">${videoCount} video${videoCount !== 1 ? 's' : ''}</span>
                </div>
            `;
            if (editFields) {
                editFields.classList.remove('hidden');
                const nameInput = document.getElementById('ytPlaylistName');
                if (nameInput) nameInput.value = title || '';
            }
            if (importBtn) importBtn.disabled = false;
        } else {
            preview.innerHTML = `<div class="yt-status error">${result.message || 'Could not load playlist info.'}</div>`;
            loadedYoutubePlaylistInfo = null;
        }
    } catch (err) {
        if (loadBtn) loadBtn.disabled = false;
        preview.innerHTML = `<div class="yt-status error">Error: ${err.message}</div>`;
        loadedYoutubePlaylistInfo = null;
    }
}

/**
 * Import YouTube playlist songs and create playlist
 */
async function importYoutubePlaylistSongs() {
    if (!loadedYoutubePlaylistInfo) {
        alert('Please load a playlist first.');
        return;
    }

    const urlInput = document.getElementById('youtubePlaylistUrl');
    const nameInput = document.getElementById('ytPlaylistName');
    const status = document.getElementById('youtubePlaylistStatus');
    const importBtn = document.getElementById('ytPlaylistImportBtn');
    const loadBtn = document.getElementById('ytPlaylistLoadBtn');
    const progressContainer = document.getElementById('youtubePlaylistProgress');
    const progressTitle = document.getElementById('ytProgressTitle');
    const progressCount = document.getElementById('ytProgressCount');
    const progressBar = document.getElementById('ytProgressBar');
    const progressLog = document.getElementById('ytProgressLog');

    const url = urlInput?.value?.trim();
    if (!url) return;

    const playlistName = nameInput?.value?.trim() || loadedYoutubePlaylistInfo.title || 'YouTube Playlist';

    // Disable buttons and show progress
    if (importBtn) importBtn.disabled = true;
    if (loadBtn) loadBtn.disabled = true;
    if (status) status.classList.add('hidden');

    // Show progress container
    if (progressContainer) {
        progressContainer.classList.remove('hidden');
        if (progressTitle) progressTitle.textContent = 'Preparing download...';
        if (progressCount) progressCount.textContent = '0/0';
        if (progressBar) progressBar.style.width = '0%';
        if (progressLog) progressLog.innerHTML = '';
    }

    // Set up progress listener
    window.electronAPI.onYoutubePlaylistProgress((data) => {
        if (progressTitle) {
            if (data.status === 'starting') {
                progressTitle.textContent = 'Starting download...';
            } else if (data.status === 'downloading') {
                progressTitle.textContent = 'Downloading...';
            } else if (data.status === 'complete') {
                progressTitle.textContent = 'Complete!';
            }
        }

        if (progressCount && data.current !== undefined && data.total) {
            progressCount.textContent = `${data.current}/${data.total}`;
        }

        if (progressBar && data.current !== undefined && data.total) {
            const percent = (data.current / data.total) * 100;
            progressBar.style.width = `${percent}%`;
        }

        if (progressLog && data.message) {
            const logItem = document.createElement('div');
            logItem.className = `yt-progress-log-item ${data.status}`;
            logItem.textContent = data.message;
            progressLog.appendChild(logItem);
            // Auto-scroll to bottom
            progressLog.scrollTop = progressLog.scrollHeight;
        }
    });

    try {
        const result = await window.electronAPI.importYoutubePlaylist({
            playlistUrl: url,
            playlistName: playlistName,
            playlistCover: loadedYoutubePlaylistInfo.thumbnail || null
        });

        // Remove the progress listener
        window.electronAPI.removeYoutubePlaylistProgressListener();

        if (result.success && result.playlist) {
            // Save the playlist to localStorage
            if (window.loadPlaylists && window.savePlaylists) {
                const playlists = window.loadPlaylists();
                playlists.push(result.playlist);
                window.savePlaylists(playlists);
            }

            if (status) {
                status.classList.remove('hidden');
                status.className = 'yt-status success';
                let msg = `Playlist "${result.playlistName}" created with ${result.songsImported} song(s)!`;
                if (result.skippedVideos > 0) {
                    msg += ` (${result.skippedVideos} unavailable skipped)`;
                }
                status.innerHTML = msg;
            }

            // Refresh UI after successful import
            if (window.reloadSongsInPlayer) await window.reloadSongsInPlayer();
            if (window.renderPlaylists && window.loadPlaylists) {
                window.renderPlaylists(window.loadPlaylists());
            }
            // Set the new playlist as active
            if (window.setActivePlaylistById && result.playlist.id) {
                window.setActivePlaylistById(result.playlist.id);
            }

            // Close modal after a brief delay to show success message
            setTimeout(() => {
                closeCreatePlaylistModal();
                resetYoutubePlaylistTab();
            }, 2500);
        } else {
            if (status) {
                status.classList.remove('hidden');
                status.className = 'yt-status error';
                status.innerHTML = `Import failed: ${result.message || 'Unknown error'}`;
            }
            if (importBtn) importBtn.disabled = false;
            if (loadBtn) loadBtn.disabled = false;
        }
    } catch (err) {
        // Remove the progress listener on error
        window.electronAPI.removeYoutubePlaylistProgressListener();

        if (status) {
            status.classList.remove('hidden');
            status.className = 'yt-status error';
            status.innerHTML = `Import error: ${err.message}`;
        }
        if (importBtn) importBtn.disabled = false;
        if (loadBtn) loadBtn.disabled = false;
    }
}

/**
 * Reset YouTube playlist tab to initial state
 */
function resetYoutubePlaylistTab() {
    loadedYoutubePlaylistInfo = null;
    const urlInput = document.getElementById('youtubePlaylistUrl');
    const preview = document.getElementById('youtubePlaylistPreview');
    const editFields = document.getElementById('youtubePlaylistEditFields');
    const status = document.getElementById('youtubePlaylistStatus');
    const importBtn = document.getElementById('ytPlaylistImportBtn');
    const nameInput = document.getElementById('ytPlaylistName');
    const progressContainer = document.getElementById('youtubePlaylistProgress');
    const progressLog = document.getElementById('ytProgressLog');

    if (urlInput) urlInput.value = '';
    if (preview) { preview.classList.add('hidden'); preview.innerHTML = ''; }
    if (editFields) editFields.classList.add('hidden');
    if (status) { status.classList.add('hidden'); status.innerHTML = ''; }
    if (importBtn) importBtn.disabled = true;
    if (nameInput) nameInput.value = '';
    if (progressContainer) progressContainer.classList.add('hidden');
    if (progressLog) progressLog.innerHTML = '';

    // Clean up any lingering progress listener
    if (window.electronAPI?.removeYoutubePlaylistProgressListener) {
        window.electronAPI.removeYoutubePlaylistProgressListener();
    }
}

window.loadYoutubePlaylistInfo = loadYoutubePlaylistInfo;
window.importYoutubePlaylistSongs = importYoutubePlaylistSongs;
window.resetYoutubePlaylistTab = resetYoutubePlaylistTab;


