import discImg from '../../images/disc.png';
import { initEqualizer } from '../plugins/equalizer.js';
import { checkCrossfade, isCrossfadeActive, cancelCrossfade } from '../plugins/crossfade.js';

// Control icons
import backIcon from './images/back.png';
import nextIcon from './images/next.png';
import playIcon from './images/play-buttton.png';
import pauseIcon from './images/pause.png';
import muteIcon from './images/mute.png';
import unmuteIcon from './images/unmute.png';
import shuffleOffIcon from '../../images/shuffle.png';
import shuffleOnIcon from '../../images/shuffle N.png';
import loopingIcon from '../../images/looping.png';
import loop2Icon from '../../images/loop2.png';
import loopIndividualIcon from '../../images/loopindividual.png';

let now_playing;
let track_art;
let track_name;
let track_artist;
let playpause_btn;
let next_btn;
let prev_btn;
let seek_slider;
let volume_slider;
let mute_btn;
let curr_time;
let total_duration;
let wave;
let randomIcon;
let repeatIcon;
let curr_track = document.createElement('audio');
curr_track.crossOrigin = 'anonymous';

let track_index = 0;
let isPlaying = false;
let isRandom = false;
let loopState = 0; // 0: no loop, 1: loop all, 2: loop individual
let loopTrackIndex = null; // Track index for loop individual
let updateTimer;
let programmaticChange = false; // Flag to prevent double-triggers
let playlistQueueIds = null;
let playlistQueue = null;
let playlistQueuePosition = null;

// Audio state manager
const audioState = {
    volume: 50, // Default volume
    isMuted: false,
    previousVolume: 50
};

// Reactive audio state updates
function updateAudioState(newState, options = {}) {
    const { persistVolume = false } = options;

    Object.assign(audioState, newState);

    curr_track.volume = audioState.isMuted
        ? 0
        : audioState.volume / 100;

    programmaticChange = true;
    volume_slider.value = audioState.isMuted ? 0 : audioState.volume;
    updateRangeFill(volume_slider);
    programmaticChange = false;

    updateMuteButtonIcon();

    if (persistVolume) {
        window.electronAPI.setUserVolume(audioState.volume);
    }
}
// Default built-in songs (commented out - only custom songs will be used)
const default_music_list = [];

// Combined music list (will be populated with custom songs only)
let music_list = [];

function updateRangeFill(rangeEl) {
    if (!rangeEl) return;
    const min = Number(rangeEl.min || 0);
    const max = Number(rangeEl.max || 100);
    const val = Number(rangeEl.value || 0);
    const pct = ((val - min) * 100) / (max - min);

    // Filled track + remaining track
    rangeEl.style.background = `linear-gradient(90deg,
        rgba(255,255,255,0.92) 0%,
        rgba(255,255,255,0.92) ${pct}%,
        rgba(255,255,255,0.18) ${pct}%,
        rgba(255,255,255,0.18) 100%)`;
}

function loadTrack(track_index){
    clearInterval(updateTimer);
    
    // Stop any currently playing audio to prevent play/pause conflicts
    if (curr_track && !curr_track.paused) {
        curr_track.pause();
    }
    
    reset();

    // Check if music list has songs
    if (!music_list || music_list.length === 0) {
        console.error('No songs available to play');
        track_name.textContent = 'No songs loaded';
        track_artist.textContent = 'Please add songs first';
        return;
    }

    // Ensure track_index is valid
    if (track_index < 0 || track_index >= music_list.length) {
        track_index = 0;
    }

    const track = music_list[track_index];
    const filePath = track.filePath;
    
    // For custom songs, fetch via IPC; for default songs, use direct URL
    if (track.isCustom && filePath) {
        console.log('Loading custom track via IPC:', { index: track_index, path: filePath, name: track.name });
        window.electronAPI.getAudioFile(filePath).then(result => {
            if (result.success) {
                // Convert base64 to Blob
                const binaryString = atob(result.data);
                const bytes = new Uint8Array(binaryString.length);
                for (let i = 0; i < binaryString.length; i++) {
                    bytes[i] = binaryString.charCodeAt(i);
                }
                const blob = new Blob([bytes], { type: 'audio/mpeg' });
                const blobUrl = URL.createObjectURL(blob);
                
                curr_track.src = blobUrl;
                curr_track.load();
                console.log('✓ Custom track loaded via Blob URL:', blobUrl);
            } else {
                console.error('Failed to load audio file:', result.message);
            }
        }).catch(error => {
            console.error('Error fetching audio file:', error);
        });
    } else {
        // For default songs, use direct URL
        console.log('Loading track:', { index: track_index, url: track.music, name: track.name });
        curr_track.src = track.music;
        curr_track.load();
    }

    // Set background image
    if (track.isCustom && track.imagePath) {
        // Load custom image via IPC
        window.electronAPI.getImageFile(track.imagePath).then(result => {
            if (result.success) {
                // Convert base64 to Blob
                const binaryString = atob(result.data);
                const bytes = new Uint8Array(binaryString.length);
                for (let i = 0; i < binaryString.length; i++) {
                    bytes[i] = binaryString.charCodeAt(i);
                }
                const blob = new Blob([bytes], { type: 'image/jpeg' });
                const blobUrl = URL.createObjectURL(blob);
                track_art.style.backgroundImage = `url("${blobUrl}")`;
                console.log('✓ Custom image loaded via Blob URL');
                // Sync fullscreen art if overlay is visible
                syncFullscreenArt();
            } else {
                console.error('Failed to load image:', result.message);
                track_art.style.backgroundImage = `url("${discImg}")`;
            }
        }).catch(error => {
            console.error('Error fetching image:', error);
            track_art.style.backgroundImage = `url("${discImg}")`;
        });
    } else {
        // Use default disc image
        track_art.style.backgroundImage = `url("${discImg}")`;
        // Sync fullscreen art
        syncFullscreenArt();
    }
    track_name.textContent = track.name;
    track_artist.textContent = track.artist;
    now_playing.textContent = "Playing music " + (track_index + 1) + " of " + music_list.length;

    updateTimer = setInterval(setUpdate, 1000);

    // Remove old ended listener and add new one with crossfade check
    curr_track.removeEventListener('ended', handleTrackEnded);
    curr_track.addEventListener('ended', handleTrackEnded);
    showPlayerBar();
    syncPlaylistQueuePosition();
    // Always sync fullscreen art info after track info is set
    syncFullscreenArt();
}

function showPlayerBar() {
    const bar = document.getElementById('playerBar');
    if (bar) {
        bar.classList.remove('hidden');
        // Add bottom padding to the shell so content isn't hidden behind bar
        const shell = document.querySelector('.app-shell');
        if (shell) shell.classList.add('has-player');
    }
}

// Fullscreen album art overlay functionality
let fsIdleTimer = null;
const FS_IDLE_TIMEOUT = 10000; // 10 seconds

function toggleFullscreenArt() {
    const overlay = document.getElementById('fullscreenArtOverlay');
    if (!overlay) return;
    
    if (overlay.classList.contains('hidden')) {
        // Show the overlay and sync current track info
        syncFullscreenArt();
        overlay.classList.remove('hidden');
        // Start idle detection
        startFsIdleTimer();
        overlay.addEventListener('mousemove', handleFsMouseMove);
        overlay.addEventListener('click', handleFsMouseMove);
    } else {
        // Hide the overlay
        overlay.classList.add('hidden');
        overlay.classList.remove('fs-idle');
        // Stop idle detection
        stopFsIdleTimer();
        overlay.removeEventListener('mousemove', handleFsMouseMove);
        overlay.removeEventListener('click', handleFsMouseMove);
    }
}

function startFsIdleTimer() {
    stopFsIdleTimer();
    fsIdleTimer = setTimeout(() => {
        const overlay = document.getElementById('fullscreenArtOverlay');
        if (overlay && !overlay.classList.contains('hidden')) {
            overlay.classList.add('fs-idle');
        }
    }, FS_IDLE_TIMEOUT);
}

function stopFsIdleTimer() {
    if (fsIdleTimer) {
        clearTimeout(fsIdleTimer);
        fsIdleTimer = null;
    }
}

function handleFsMouseMove() {
    const overlay = document.getElementById('fullscreenArtOverlay');
    if (overlay) {
        overlay.classList.remove('fs-idle');
    }
    startFsIdleTimer();
}

function syncFullscreenArt() {
    const overlay = document.getElementById('fullscreenArtOverlay');
    if (!overlay) return;
    
    const fsArtImage = overlay.querySelector('.fullscreen-art-image');
    const fsArtBg = overlay.querySelector('.fullscreen-art-bg');
    const fsTitle = overlay.querySelector('.fullscreen-art-title');
    const fsArtist = overlay.querySelector('.fullscreen-art-artist');
    
    // Get current track art image from player bar
    const currentArt = track_art ? track_art.style.backgroundImage : '';
    
    if (fsArtImage) {
        fsArtImage.style.backgroundImage = currentArt;
    }
    if (fsArtBg) {
        fsArtBg.style.backgroundImage = currentArt;
    }
    if (fsTitle && track_name) {
        fsTitle.textContent = track_name.textContent;
    }
    if (fsArtist && track_artist) {
        fsArtist.textContent = track_artist.textContent;
    }
    
    // Sync control buttons
    const fsPlayPause = overlay.querySelector('.fs-playpause-track');
    const fsPrev = overlay.querySelector('.fs-prev-track');
    const fsNext = overlay.querySelector('.fs-next-track');
    const fsRandom = overlay.querySelector('.fs-random-track');
    const fsRepeat = overlay.querySelector('.fs-repeat-track');
    const fsMute = overlay.querySelector('.fs-mute-track');
    const fsVolumeSlider = overlay.querySelector('.fs-volume-slider');
    
    if (fsPlayPause) {
        fsPlayPause.style.backgroundImage = `url("${isPlaying ? pauseIcon : playIcon}")`;
    }
    if (fsPrev) {
        fsPrev.style.backgroundImage = `url("${backIcon}")`;
    }
    if (fsNext) {
        fsNext.style.backgroundImage = `url("${nextIcon}")`;
    }
    if (fsRandom) {
        fsRandom.style.backgroundImage = `url("${isRandom ? shuffleOnIcon : shuffleOffIcon}")`;
    }
    if (fsRepeat) {
        let loopIcon;
        switch (loopState) {
            case 1: loopIcon = loop2Icon; break;
            case 2: loopIcon = loopIndividualIcon; break;
            default: loopIcon = loopingIcon;
        }
        fsRepeat.style.backgroundImage = `url("${loopIcon}")`;
    }
    if (fsMute) {
        fsMute.style.backgroundImage = `url("${audioState.isMuted || audioState.volume === 0 ? muteIcon : unmuteIcon}")`;
    }
    if (fsVolumeSlider) {
        fsVolumeSlider.value = audioState.isMuted ? 0 : audioState.volume;
        updateFsVolumeFill(fsVolumeSlider);
    }
    
    // Sync time display
    const fsCurrentTime = overlay.querySelector('.fs-current-time');
    const fsTotalDuration = overlay.querySelector('.fs-total-duration');
    if (fsCurrentTime && curr_time) {
        fsCurrentTime.textContent = curr_time.textContent;
    }
    if (fsTotalDuration && total_duration) {
        fsTotalDuration.textContent = total_duration.textContent;
    }
}

function updateFsVolumeFill(slider) {
    if (!slider) return;
    const min = Number(slider.min || 0);
    const max = Number(slider.max || 100);
    const val = Number(slider.value || 0);
    const pct = ((val - min) * 100) / (max - min);
    slider.style.background = `linear-gradient(90deg,
        rgba(255,255,255,0.9) 0%,
        rgba(255,255,255,0.9) ${pct}%,
        rgba(255,255,255,0.2) ${pct}%,
        rgba(255,255,255,0.2) 100%)`;
}

function initFullscreenControls() {
    const overlay = document.getElementById('fullscreenArtOverlay');
    if (!overlay) return;
    
    const fsVolumeSlider = overlay.querySelector('.fs-volume-slider');
    if (fsVolumeSlider) {
        fsVolumeSlider.addEventListener('input', () => {
            const vol = Number(fsVolumeSlider.value);
            updateAudioState({
                volume: vol,
                isMuted: vol === 0,
                previousVolume: vol > 0 ? vol : audioState.previousVolume
            });
            updateFsVolumeFill(fsVolumeSlider);
            // Also sync the mute icon
            const fsMute = overlay.querySelector('.fs-mute-track');
            if (fsMute) {
                fsMute.style.backgroundImage = `url("${vol === 0 ? muteIcon : unmuteIcon}")`;
            }
        });
        
        fsVolumeSlider.addEventListener('change', () => {
            const vol = Number(fsVolumeSlider.value);
            updateAudioState({
                volume: vol,
                isMuted: vol === 0,
                previousVolume: vol > 0 ? vol : audioState.previousVolume
            }, { persistVolume: true });
        });
    }
}

// Close fullscreen art overlay with Escape key
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
        const overlay = document.getElementById('fullscreenArtOverlay');
        if (overlay && !overlay.classList.contains('hidden')) {
            toggleFullscreenArt();
        }
    }
});

function syncPlaylistQueuePosition() {
    if (!playlistQueue || playlistQueue.length === 0) {
        playlistQueuePosition = null;
        return;
    }
    const position = playlistQueue.indexOf(track_index);
    playlistQueuePosition = position >= 0 ? position : null;
}


function reset(){
    curr_time.textContent = "00:00";
    total_duration.textContent = "00:00";
    programmaticChange = true;
    seek_slider.value = 0;
    updateRangeFill(seek_slider);
    programmaticChange = false;
}

function playpauseTrack(){
    isPlaying ? pauseTrack() : playTrack();
}

function playTrack(){
    if (!music_list || music_list.length === 0) {
        console.error('No songs to play');
        return;
    }
    
    // Only attempt to play if audio source is set and ready
    if (!curr_track.src) {
        console.warn('Audio source not set');
        return;
    }
    
    console.log('Playing track:', { index: track_index, url: curr_track.src, readyState: curr_track.readyState });
    const playPromise = curr_track.play();
    if (playPromise !== undefined) {
        playPromise.catch((error) => {
            // Ignore AbortError - it's harmless and happens during rapid play/pause
            if (error.name !== 'AbortError') {
                console.error('Error playing track:', error);
            }
        });
    }
    isPlaying = true;
    playpause_btn.style.backgroundImage = `url("${pauseIcon}")`;
    wave.classList.add('loader');
    if (track_art) {
        track_art.classList.add('spinning');
        track_art.classList.remove('spinning-paused');
    }
    // Sync fullscreen play button
    const fsPlayPause = document.querySelector('.fs-playpause-track');
    if (fsPlayPause) fsPlayPause.style.backgroundImage = `url("${pauseIcon}")`;
}

function pauseTrack(){
    curr_track.pause();
    isPlaying = false;
    playpause_btn.style.backgroundImage = `url("${playIcon}")`;
    wave.classList.remove('loader');
    if (track_art) {
        track_art.classList.add('spinning');
        track_art.classList.add('spinning-paused');
    }
    // Sync fullscreen play button
    const fsPlayPause = document.querySelector('.fs-playpause-track');
    if (fsPlayPause) fsPlayPause.style.backgroundImage = `url("${playIcon}")`;
}

/**
 * Handle track ended event - respects crossfade state
 */
function handleTrackEnded() {
    // If crossfade is active, don't trigger normal next track
    // The crossfade module will handle the transition
    if (window.isCrossfadeActive && window.isCrossfadeActive()) {
        return;
    }
    nextTrack();
}

function nextTrack(){
    // Cancel any active crossfade when manually switching tracks
    if (window.cancelCrossfade) {
        window.cancelCrossfade();
    }
    
    // If loop individual is active, just replay the current track
    if (loopState === 2) {
        window._autoplayRequested = true;
        loadTrack(track_index);
        return;
    }

    if (playlistQueue && playlistQueue.length > 0) {
        if (isRandom) {
            const random_index = Math.floor((Math.random() * playlistQueue.length));
            track_index = playlistQueue[random_index];
            playlistQueuePosition = random_index;
        } else {
            if (playlistQueuePosition === null) {
                syncPlaylistQueuePosition();
            }
            if (playlistQueuePosition === null) {
                playlistQueuePosition = 0;
            } else if (playlistQueuePosition < playlistQueue.length - 1) {
                playlistQueuePosition += 1;
            } else {
                playlistQueuePosition = 0;
            }
            track_index = playlistQueue[playlistQueuePosition];
        }
    } else {
        if(track_index < music_list.length - 1 && isRandom === false){
            track_index += 1;
        }
        else if(isRandom === true){
            let random_index = Math.floor((Math.random() * music_list.length));
            track_index = random_index;
        }
        else{
            track_index = 0;
        }
    }
    // Set autoplay flag so the song will play when it's ready
    window._autoplayRequested = true;
    loadTrack(track_index);
}

function prevTrack(){
    // Cancel any active crossfade when manually switching tracks
    if (window.cancelCrossfade) {
        window.cancelCrossfade();
    }
    
    if (playlistQueue && playlistQueue.length > 0) {
        if (isRandom) {
            const random_index = Math.floor((Math.random() * playlistQueue.length));
            track_index = playlistQueue[random_index];
            playlistQueuePosition = random_index;
        } else {
            if (playlistQueuePosition === null) {
                syncPlaylistQueuePosition();
            }
            if (playlistQueuePosition === null) {
                playlistQueuePosition = 0;
            } else if (playlistQueuePosition > 0) {
                playlistQueuePosition -= 1;
            } else {
                playlistQueuePosition = playlistQueue.length - 1;
            }
            track_index = playlistQueue[playlistQueuePosition];
        }
    } else {
        if(track_index > 0){
            track_index -= 1;
        }
        else{
            track_index = music_list.length - 1;
        }
    }
    // Set autoplay flag so the song will play when it's ready
    window._autoplayRequested = true;
    loadTrack(track_index);
}

function seekTo(){
    // Check if duration is a valid finite number
    if (!isFinite(curr_track.duration)) {
        console.warn('Cannot seek: track duration is not yet loaded or invalid');
        return;
    }
    let seekto = curr_track.duration * (seek_slider.value / 100);
    if (isFinite(seekto)) {
        curr_track.currentTime = seekto;
    }
}

function setVolume(){
    // This function is no longer needed - volume changes are handled directly in toggleMute() and volume slider input listener
}

function toggleMute() {
    console.log(`🔊 Mute clicked — volume: ${audioState.volume}`);
    if (audioState.isMuted) {
        const restoredVolume = audioState.previousVolume > 0
            ? audioState.previousVolume
            : 50;
        updateAudioState({
            isMuted: false,
            volume: restoredVolume
        }, { persistVolume: true });
    } else {
        const prev = audioState.volume > 0 ? audioState.volume : audioState.previousVolume;
        updateAudioState({
            isMuted: true,
            previousVolume: prev,
            volume: 0
        });
    }
}

function updateMuteButtonIcon() {
    mute_btn.style.backgroundImage =
        audioState.isMuted || audioState.volume === 0
            ? `url("${muteIcon}")`
            : `url("${unmuteIcon}")`;
    // Sync fullscreen mute button and volume slider
    const fsMute = document.querySelector('.fs-mute-track');
    const fsVolumeSlider = document.querySelector('.fs-volume-slider');
    if (fsMute) {
        fsMute.style.backgroundImage = audioState.isMuted || audioState.volume === 0
            ? `url("${muteIcon}")`
            : `url("${unmuteIcon}")`;
    }
    if (fsVolumeSlider) {
        fsVolumeSlider.value = audioState.isMuted ? 0 : audioState.volume;
        updateFsVolumeFill(fsVolumeSlider);
    }
}

function setUpdate(){
    let seekbar_value = (curr_track.currentTime / curr_track.duration) * 100;
    if (isNaN(seekbar_value)) seekbar_value = 0;
    programmaticChange = true;
    seek_slider.value = seekbar_value;
    updateRangeFill(seek_slider);
    programmaticChange = false;
    updateMuteButtonIcon();

    let ct_minutes = Math.floor(curr_track.currentTime / 60);
    let ct_seconds = Math.floor(curr_track.currentTime - ct_minutes * 60);
    let duration_minutes = Math.floor(curr_track.duration / 60);
    let duration_seconds = Math.floor(curr_track.duration - duration_minutes * 60);

    if(isNaN(duration_minutes) || isNaN(duration_seconds)){
        total_duration.textContent = "00:00";
    }
    else{
        if(ct_minutes < 10) {ct_minutes = "0" + ct_minutes;}
        if(ct_seconds < 10) {ct_seconds = "0" + ct_seconds;}
        if(duration_minutes < 10) {duration_minutes = "0" + duration_minutes;}
        if(duration_seconds < 10) {duration_seconds = "0" + duration_seconds;}

        curr_time.textContent = ct_minutes + ":" + ct_seconds;
        total_duration.textContent = duration_minutes + ":" + duration_seconds;
    }

    // Sync fullscreen time display
    const fsCurrentTime = document.querySelector('.fs-current-time');
    const fsTotalDuration = document.querySelector('.fs-total-duration');
    if (fsCurrentTime) fsCurrentTime.textContent = curr_time.textContent;
    if (fsTotalDuration) fsTotalDuration.textContent = total_duration.textContent;

    updateRangeFill(seek_slider);
    
    // Check for crossfade trigger
    if (window.checkCrossfade) {
        window.checkCrossfade(curr_track, track_index);
    }
}

function repeatTrack(){
    // Cycle through loop states: 0 (no loop) -> 1 (loop all) -> 2 (loop individual) -> 0
    loopState = (loopState + 1) % 3;
    if (loopState === 2) {
        loopTrackIndex = track_index; // Set the track to loop
    } else {
        loopTrackIndex = null;
    }
    updateLoopIcon();
}

function randomTrack(){
    isRandom = isRandom ? false : true;
    updateShuffleIcon();
}

function updateShuffleIcon() {
    if (!randomIcon) return;
    randomIcon.style.backgroundImage = `url("${isRandom ? shuffleOnIcon : shuffleOffIcon}")`;
    // Sync fullscreen shuffle button
    const fsRandom = document.querySelector('.fs-random-track');
    if (fsRandom) fsRandom.style.backgroundImage = `url("${isRandom ? shuffleOnIcon : shuffleOffIcon}")`;
}

function updateLoopIcon() {
    if (!repeatIcon) return;
    let iconUrl;
    switch (loopState) {
        case 1:
            iconUrl = loop2Icon; // Loop all
            break;
        case 2:
            iconUrl = loopIndividualIcon; // Loop individual
            break;
        default:
            iconUrl = loopingIcon; // No loop
    }
    repeatIcon.style.backgroundImage = `url("${iconUrl}")`;
    // Sync fullscreen repeat button
    const fsRepeat = document.querySelector('.fs-repeat-track');
    if (fsRepeat) fsRepeat.style.backgroundImage = `url("${iconUrl}")`;
}

// Load custom songs from database
async function loadCustomSongs() {
    try {
        const customSongs = await window.electronAPI.getAllSongs();
        // Reset to default songs
        music_list = [...default_music_list];
        
        // Add custom songs
        if (customSongs && customSongs.length > 0) {
            customSongs.forEach(song => {
                if (song.file_path) {
                    music_list.push({
                        id: song.id,
                        imagePath: song.image_path,  // Store image file path separately
                        name: song.name,
                        artist: song.author || 'Unknown Artist',
                        music: song.file_path,  // Store actual file path, not URL
                        filePath: song.file_path,  // Also store for reference
                        isCustom: true
                    });
                }
            });
            console.log(`✓ Loaded ${customSongs.length} custom songs`);
        }
    } catch (error) {
        console.error('Failed to load custom songs:', error);
    }
    rebuildPlaylistQueue();
}

function buildPlaylistQueueFromIds(ids) {
    if (!Array.isArray(ids) || ids.length === 0) {
        return null;
    }
    const indexMap = new Map(music_list.map((song, index) => [song.id, index]));
    const indices = ids.map((id) => indexMap.get(id)).filter((index) => Number.isInteger(index));
    return indices.length ? indices : null;
}

function setPlaylistQueue(ids) {
    playlistQueueIds = Array.isArray(ids) ? ids.slice() : null;
    playlistQueue = buildPlaylistQueueFromIds(playlistQueueIds);
    playlistQueuePosition = null;
}

function rebuildPlaylistQueue() {
    if (!playlistQueueIds || playlistQueueIds.length === 0) {
        playlistQueue = null;
        playlistQueuePosition = null;
        return;
    }
    playlistQueue = buildPlaylistQueueFromIds(playlistQueueIds);
    syncPlaylistQueuePosition();
}

// Reload songs in player (called after adding a new song)
async function reloadSongsInPlayer() {
    await loadCustomSongs();
    rebuildPlaylistQueue();
    
    // Always notify about song updates (for starter page UI refresh)
    if (window.onPlayerSongsUpdated) {
        window.onPlayerSongsUpdated();
    }
    
    // Only reload track if player has been initialized
    if (track_name && track_artist && now_playing) {
        track_index = 0;
        loadTrack(track_index);
        console.log('✓ Songs reloaded');
    } else {
        console.warn('Player not yet initialized, songs will load when player is opened');
    }
}

export function initPlayer(autoPlay = false) {
    // Get all DOM elements - scoped to #playerBar (bottom bar)
    const playerBar = document.getElementById('playerBar');
    if (!playerBar) {
        console.error("Player bar element not found");
        return;
    }
    now_playing = playerBar.querySelector(".now-playing");
    track_art = playerBar.querySelector(".track-art");
    track_name = playerBar.querySelector(".track-name");
    track_artist = playerBar.querySelector(".track-artist");
    playpause_btn = playerBar.querySelector(".playpause-track");
    next_btn = playerBar.querySelector(".next-track");
    prev_btn = playerBar.querySelector(".prev-track");
    seek_slider = playerBar.querySelector(".seek_slider");
    volume_slider = playerBar.querySelector(".volume_slider");
    mute_btn = playerBar.querySelector(".mute-track");
    curr_time = playerBar.querySelector(".current-time");
    total_duration = playerBar.querySelector(".total-duration");
    wave = playerBar.querySelector("#wave");
    randomIcon = playerBar.querySelector(".random-track");
    repeatIcon = playerBar.querySelector(".repeat-track");

    // Check if elements were found
    if (!track_art || !track_name || !track_artist) {
        console.error("Player elements not found");
        return;
    }

    // Remember if autoplay was requested by caller
    window._autoplayRequested = !!autoPlay;

    // Remove old event listeners to prevent duplicates
    if (window._audioErrorHandler) {
        curr_track.removeEventListener('error', window._audioErrorHandler);
    }
    if (window._audioCanplayHandler) {
        curr_track.removeEventListener('canplay', window._audioCanplayHandler);
    }

    // Set up audio element error handling
    window._audioErrorHandler = (e) => {
        console.error('Audio error:', e.target.error, curr_track.src);
    };
    curr_track.addEventListener('error', window._audioErrorHandler);

    // When audio can play, if autoplay was requested, start playback
    window._audioCanplayHandler = () => {
        console.log('✓ Audio can play:', curr_track.src);
        if (window._autoplayRequested) {
            // Attempt to play and then clear the flag
            playTrack();
            window._autoplayRequested = false;
        }
    };
    curr_track.addEventListener('canplay', window._audioCanplayHandler);

    // Set control button background images
    if (prev_btn) {
        prev_btn.style.backgroundImage = `url("${backIcon}")`;
    }
    if (next_btn) {
        next_btn.style.backgroundImage = `url("${nextIcon}")`;
    }
    if (playpause_btn) {
        playpause_btn.style.backgroundImage = `url("${playIcon}")`;
    }
    if (mute_btn) {
        mute_btn.style.backgroundImage = `url("${unmuteIcon}")`;
        mute_btn.addEventListener('click', toggleMute);
    }
    if (randomIcon) {
        randomIcon.style.backgroundPosition = 'center';
        randomIcon.style.backgroundRepeat = 'no-repeat';
        randomIcon.style.backgroundSize = '58%';
        updateShuffleIcon();
    }
    if (repeatIcon) {
        repeatIcon.style.backgroundPosition = 'center';
        repeatIcon.style.backgroundRepeat = 'no-repeat';
        repeatIcon.style.backgroundSize = '58%';
        updateLoopIcon();
    }

    // Add event listener for range slider updates
    if (seek_slider) {
        seek_slider.addEventListener('input', () => updateRangeFill(seek_slider));
        seek_slider.addEventListener('change', () => {
            if (!programmaticChange) {
                seekTo();
            }
        });
        // Initialize slider fill
        updateRangeFill(seek_slider);
    }
    if (volume_slider) {
        // Live volume update (no DB writes)
        volume_slider.addEventListener('input', () => {
            if (programmaticChange) return;

            const vol = Number(volume_slider.value);
            updateAudioState({
                volume: vol,
                isMuted: vol === 0,
                previousVolume: vol > 0 ? vol : audioState.previousVolume
            });
        });

        // Save volume ONLY on mouse release
        volume_slider.addEventListener('change', () => {
            const vol = Number(volume_slider.value);
            updateAudioState({
                volume: vol,
                isMuted: vol === 0,
                previousVolume: vol > 0 ? vol : audioState.previousVolume
            }, { persistVolume: true });
        });

        // Load saved volume once
        window.electronAPI.getUserVolume()
            .then((savedVolume) => {
                updateAudioState({
                    volume: savedVolume,
                    isMuted: savedVolume === 0,
                    previousVolume: savedVolume > 0 ? savedVolume : audioState.previousVolume
                });
            })
            .catch(() => {
                updateAudioState({
                    volume: 50,
                    isMuted: false,
                    previousVolume: 50
                });
            });
    }


    // Load custom songs from database
    loadCustomSongs().then(() => {
        // Load first track
        loadTrack(track_index);
        // Update slider fill after loading track
        if (seek_slider) updateRangeFill(seek_slider);
        if (window.onPlayerSongsUpdated) {
            window.onPlayerSongsUpdated();
        }
    });

    // Initialize equalizer with the audio element
    // Need to wait for user interaction to create AudioContext
    const initEqOnInteraction = () => {
        if (window.initEqualizer) {
            window.initEqualizer(curr_track);
        }
        document.removeEventListener('click', initEqOnInteraction);
        document.removeEventListener('keydown', initEqOnInteraction);
    };
    document.addEventListener('click', initEqOnInteraction, { once: true });
    document.addEventListener('keydown', initEqOnInteraction, { once: true });

    rebuildPlaylistQueue();
    
    // Initialize fullscreen controls
    initFullscreenControls();

// Make functions globally accessible for onclick handlers
window.randomTrack = randomTrack;
window.prevTrack = prevTrack;
window.playpauseTrack = playpauseTrack;
window.nextTrack = nextTrack;
window.repeatTrack = repeatTrack;
window.seekTo = seekTo;
window.setVolume = setVolume;
window.playTrack = playTrack;
window.pauseTrack = pauseTrack;
window.toggleMute = toggleMute;
window.reloadSongsInPlayer = reloadSongsInPlayer;
window.getPlayerSongs = () => music_list;
window.setPlaylistQueue = setPlaylistQueue;
window.toggleFullscreenArt = toggleFullscreenArt;
window.playSongById = (songId, queueIds) => {
    if (queueIds) {
        setPlaylistQueue(queueIds);
    }
    const index = music_list.findIndex((song) => song.id === songId);
    if (index >= 0) {
        track_index = index;
        syncPlaylistQueuePosition();
        window._autoplayRequested = true;
        loadTrack(track_index);
    }
};

// Crossfade swap handler - swaps audio elements when crossfade completes
window._crossfadeSwapHandler = (newAudioElement, nextIndex) => {
    if (!newAudioElement || nextIndex === undefined || nextIndex < 0 || nextIndex >= music_list.length) {
        return;
    }
    
    // Remove event listeners from old track
    if (window._audioErrorHandler) {
        curr_track.removeEventListener('error', window._audioErrorHandler);
    }
    if (window._audioCanplayHandler) {
        curr_track.removeEventListener('canplay', window._audioCanplayHandler);
    }
    curr_track.removeEventListener('ended', handleTrackEnded);
    
    // Swap audio elements
    const oldTrack = curr_track;
    curr_track = newAudioElement;
    
    // Re-add event listeners to new track
    curr_track.addEventListener('error', window._audioErrorHandler);
    curr_track.addEventListener('canplay', window._audioCanplayHandler);
    curr_track.removeEventListener('ended', handleTrackEnded);
    curr_track.addEventListener('ended', handleTrackEnded);
    
    // Update track index
    track_index = nextIndex;
    syncPlaylistQueuePosition();
    
    // Update UI (track info) without reloading audio
    const track = music_list[track_index];
    if (track) {
        track_name.textContent = track.name;
        track_artist.textContent = track.artist;
        now_playing.textContent = "Playing music " + (track_index + 1) + " of " + music_list.length;
        
        // Update track art
        if (track.isCustom && track.imagePath) {
            window.electronAPI.getImageFile(track.imagePath).then(result => {
                if (result.success) {
                    const binaryString = atob(result.data);
                    const bytes = new Uint8Array(binaryString.length);
                    for (let i = 0; i < binaryString.length; i++) {
                        bytes[i] = binaryString.charCodeAt(i);
                    }
                    const blob = new Blob([bytes], { type: 'image/jpeg' });
                    const blobUrl = URL.createObjectURL(blob);
                    track_art.style.backgroundImage = `url("${blobUrl}")`;
                    syncFullscreenArt();
                } else {
                    track_art.style.backgroundImage = `url("${discImg}")`;
                }
            }).catch(() => {
                track_art.style.backgroundImage = `url("${discImg}")`;
            });
        } else {
            track_art.style.backgroundImage = `url("${discImg}")`;
            syncFullscreenArt();
        }
    }
    
    // Update play state
    isPlaying = true;
    playpause_btn.style.backgroundImage = `url("${pauseIcon}")`;
    wave.classList.add('loader');
    if (track_art) {
        track_art.classList.add('spinning');
        track_art.classList.remove('spinning-paused');
    }
    
    // Sync fullscreen play button
    const fsPlayPause = document.querySelector('.fs-playpause-track');
    if (fsPlayPause) fsPlayPause.style.backgroundImage = `url("${pauseIcon}")`;
    
    // Initialize equalizer on new audio element if needed
    if (window.initEqualizer) {
        window.initEqualizer(curr_track);
    }
    
    console.log('✓ Crossfade swap complete, now playing:', track?.name);
};
}
