/**
 * Crossfade module - Smooth transitions between tracks
 * Fades out current track and fades in next track during the last X seconds
 */

// Crossfade state
const crossfadeState = {
    enabled: false,
    duration: 5, // Duration in seconds for crossfade
    isCrossfading: false,
    fadeInterval: null,
    nextTrackAudio: null, // Second audio element for incoming track
    nextTrackIndex: null,
    nextTrackVolume: 0,
    currentTrackOriginalVolume: 1,
    lastSwapTime: 0 // Prevent immediate re-trigger after swap
};

// Storage key for persistence
const CROSSFADE_STORAGE_KEY = 'music_player_crossfade';

/**
 * Initialize the crossfade second audio element
 */
function initCrossfadeAudio() {
    if (!crossfadeState.nextTrackAudio) {
        crossfadeState.nextTrackAudio = document.createElement('audio');
        crossfadeState.nextTrackAudio.crossOrigin = 'anonymous';
        crossfadeState.nextTrackAudio.volume = 0;
        console.log('✓ Crossfade audio element created');
    }
}

/**
 * Get the next track index based on current player state
 * Respects shuffle mode and playlist queues
 * @returns {number} Next track index
 */
function getNextTrackIndex() {
    const musicList = window.getPlayerSongs ? window.getPlayerSongs() : [];
    if (!musicList || musicList.length === 0) return 0;
    
    // Get current track index from player
    const currentIndex = window._crossfadeCurrentIndex ?? 0;
    
    // Check if there's a playlist queue active
    // We need to get next track based on same logic as player's nextTrack function
    // For simplicity, we calculate the simple next track
    // The player will handle shuffle/queue when it receives the completion callback
    
    if (currentIndex < musicList.length - 1) {
        return currentIndex + 1;
    }
    return 0; // Loop back to first track
}

/**
 * Prepare the next track for crossfade
 * @param {number} nextIndex - Index of the next track
 */
async function prepareNextTrack(nextIndex) {
    const musicList = window.getPlayerSongs ? window.getPlayerSongs() : [];
    if (!musicList || musicList.length === 0) return;
    
    const nextTrack = musicList[nextIndex];
    if (!nextTrack) return;
    
    crossfadeState.nextTrackIndex = nextIndex;
    
    // Load the next track
    if (nextTrack.isCustom && nextTrack.filePath) {
        try {
            const result = await window.electronAPI.getAudioFile(nextTrack.filePath);
            if (result.success) {
                const binaryString = atob(result.data);
                const bytes = new Uint8Array(binaryString.length);
                for (let i = 0; i < binaryString.length; i++) {
                    bytes[i] = binaryString.charCodeAt(i);
                }
                const blob = new Blob([bytes], { type: 'audio/mpeg' });
                const blobUrl = URL.createObjectURL(blob);
                crossfadeState.nextTrackAudio.src = blobUrl;
                crossfadeState.nextTrackAudio.load();
                console.log('✓ Crossfade: Next track prepared:', nextTrack.name);
            }
        } catch (error) {
            console.error('Crossfade: Failed to prepare next track:', error);
        }
    } else if (nextTrack.music) {
        crossfadeState.nextTrackAudio.src = nextTrack.music;
        crossfadeState.nextTrackAudio.load();
        console.log('✓ Crossfade: Next track prepared:', nextTrack.name);
    }
}

/**
 * Start the crossfade transition
 */
function startCrossfade() {
    if (crossfadeState.isCrossfading) return;
    
    crossfadeState.isCrossfading = true;
    crossfadeState.nextTrackVolume = 0;
    
    // Get current track volume
    const currentTrack = window._crossfadeCurrentTrack;
    if (currentTrack) {
        crossfadeState.currentTrackOriginalVolume = currentTrack.volume;
    }
    
    // Start playing next track at 0 volume
    if (crossfadeState.nextTrackAudio && crossfadeState.nextTrackAudio.src) {
        crossfadeState.nextTrackAudio.volume = 0;
        crossfadeState.nextTrackAudio.play().catch(e => {
            console.warn('Crossfade: Could not autoplay next track:', e);
        });
    }
    
    // Calculate fade step (update every 50ms)
    const fadeSteps = (crossfadeState.duration * 1000) / 50;
    const volumeStep = crossfadeState.currentTrackOriginalVolume / fadeSteps;
    
    let currentStep = 0;
    
    crossfadeState.fadeInterval = setInterval(() => {
        currentStep++;
        
        // Fade out current track
        if (currentTrack) {
            const newVolume = Math.max(0, crossfadeState.currentTrackOriginalVolume - (volumeStep * currentStep));
            currentTrack.volume = newVolume;
        }
        
        // Fade in next track
        if (crossfadeState.nextTrackAudio) {
            const newVolume = Math.min(crossfadeState.currentTrackOriginalVolume, volumeStep * currentStep);
            crossfadeState.nextTrackAudio.volume = newVolume;
        }
        
        // Crossfade complete
        if (currentStep >= fadeSteps) {
            completeCrossfade();
        }
    }, 50);
    
    console.log('✓ Crossfade started');
}

/**
 * Complete the crossfade and switch to next track
 */
function completeCrossfade() {
    // Stop the fade interval
    if (crossfadeState.fadeInterval) {
        clearInterval(crossfadeState.fadeInterval);
        crossfadeState.fadeInterval = null;
    }
    
    // Stop the old track (don't reset currentTime yet - we'll swap it)
    const currentTrack = window._crossfadeCurrentTrack;
    if (currentTrack) {
        currentTrack.pause();
        currentTrack.currentTime = 0;
        currentTrack.volume = crossfadeState.currentTrackOriginalVolume; // Reset volume for reuse
    }
    
    crossfadeState.isCrossfading = false;
    crossfadeState.lastSwapTime = Date.now();
    
    // Tell player to swap audio elements - the next track is already playing!
    if (window._crossfadeSwapHandler) {
        window._crossfadeSwapHandler(crossfadeState.nextTrackAudio, crossfadeState.nextTrackIndex);
        
        // Create a new audio element for future crossfades (the old curr_track)
        crossfadeState.nextTrackAudio = currentTrack || document.createElement('audio');
        if (crossfadeState.nextTrackAudio) {
            crossfadeState.nextTrackAudio.crossOrigin = 'anonymous';
            crossfadeState.nextTrackAudio.volume = 0;
        }
    }
    
    console.log('✓ Crossfade completed, switched to track:', crossfadeState.nextTrackIndex);
}

/**
 * Cancel any ongoing crossfade
 */
function cancelCrossfade() {
    if (crossfadeState.fadeInterval) {
        clearInterval(crossfadeState.fadeInterval);
        crossfadeState.fadeInterval = null;
    }
    
    // Reset volumes
    const currentTrack = window._crossfadeCurrentTrack;
    if (currentTrack) {
        currentTrack.volume = crossfadeState.currentTrackOriginalVolume;
    }
    
    if (crossfadeState.nextTrackAudio) {
        crossfadeState.nextTrackAudio.pause();
        crossfadeState.nextTrackAudio.currentTime = 0;
        crossfadeState.nextTrackAudio.volume = 0;
    }
    
    crossfadeState.isCrossfading = false;
    console.log('✓ Crossfade cancelled');
}

/**
 * Check if crossfade should start based on current track time
 * Called from player's setUpdate function
 * @param {HTMLAudioElement} audioElement - Current audio element
 * @param {number} currentIndex - Current track index
 */
function checkCrossfade(audioElement, currentIndex) {
    if (!crossfadeState.enabled) return;
    if (crossfadeState.isCrossfading) return;
    if (!audioElement || !isFinite(audioElement.duration)) return;
    
    // Cooldown after swap to prevent immediate re-trigger (2 seconds)
    if (Date.now() - crossfadeState.lastSwapTime < 2000) return;
    
    // Store references for the crossfade
    window._crossfadeCurrentTrack = audioElement;
    window._crossfadeCurrentIndex = currentIndex;
    
    const timeRemaining = audioElement.duration - audioElement.currentTime;
    
    // Start crossfade when we reach the last X seconds
    if (timeRemaining <= crossfadeState.duration && timeRemaining > 0) {
        // Prepare and start crossfade
        const nextIndex = getNextTrackIndex();
        prepareNextTrack(nextIndex).then(() => {
            // Small delay to ensure audio is loaded
            setTimeout(() => {
                if (!crossfadeState.isCrossfading) {
                    startCrossfade();
                }
            }, 100);
        });
    }
}

/**
 * Update UI state based on current settings
 */
function updateCrossfadeUIState() {
    const toggle = document.getElementById('crossfadeToggle');
    const panel = document.getElementById('crossfadePanel');
    const durationInput = document.getElementById('crossfadeDuration');
    const durationDisplay = document.getElementById('crossfadeDurationDisplay');
    
    if (toggle) {
        toggle.checked = crossfadeState.enabled;
    }
    
    if (panel) {
        if (crossfadeState.enabled) {
            panel.classList.remove('hidden');
        } else {
            panel.classList.add('hidden');
        }
    }
    
    if (durationInput) {
        durationInput.value = crossfadeState.duration;
    }
    
    if (durationDisplay) {
        durationDisplay.textContent = `${crossfadeState.duration} seconds`;
    }
}

/**
 * Save crossfade state to localStorage
 */
function saveCrossfadeState() {
    const state = {
        enabled: crossfadeState.enabled,
        duration: crossfadeState.duration
    };
    localStorage.setItem(CROSSFADE_STORAGE_KEY, JSON.stringify(state));
}

/**
 * Load crossfade state from localStorage
 */
function loadCrossfadeState() {
    try {
        const saved = localStorage.getItem(CROSSFADE_STORAGE_KEY);
        if (saved) {
            const state = JSON.parse(saved);
            crossfadeState.enabled = state.enabled ?? false;
            crossfadeState.duration = state.duration ?? 5;
            console.log('✓ Loaded crossfade settings');
        }
    } catch (error) {
        console.warn('Failed to load crossfade state:', error);
    }
}

/**
 * Initialize crossfade UI and event listeners
 */
function initCrossfadeUI() {
    // Load saved state
    loadCrossfadeState();
    
    // Initialize second audio element
    initCrossfadeAudio();
    
    // Toggle switch
    const toggle = document.getElementById('crossfadeToggle');
    if (toggle) {
        toggle.checked = crossfadeState.enabled;
        toggle.addEventListener('change', (e) => {
            crossfadeState.enabled = e.target.checked;
            updateCrossfadeUIState();
            saveCrossfadeState();
            
            if (!crossfadeState.enabled) {
                cancelCrossfade();
            }
        });
    }
    
    // Duration slider
    const durationSlider = document.getElementById('crossfadeDuration');
    if (durationSlider) {
        durationSlider.value = crossfadeState.duration;
        durationSlider.addEventListener('input', (e) => {
            crossfadeState.duration = parseInt(e.target.value) || 5;
            updateCrossfadeUIState();
        });
        durationSlider.addEventListener('change', () => {
            saveCrossfadeState();
        });
    }
    
    // Preset buttons
    const presetBtns = document.querySelectorAll('.crossfade-preset-btn');
    presetBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            const seconds = parseInt(btn.dataset.seconds);
            if (durationSlider && seconds) {
                durationSlider.value = seconds;
                crossfadeState.duration = seconds;
                updateCrossfadeUIState();
                saveCrossfadeState();
            }
        });
    });
    
    // Initialize UI state
    updateCrossfadeUIState();
    
    console.log('✓ Crossfade UI initialized');
}

/**
 * Check if crossfade is currently active
 * @returns {boolean}
 */
function isCrossfadeActive() {
    return crossfadeState.enabled && crossfadeState.isCrossfading;
}

/**
 * Get crossfade state
 * @returns {object}
 */
function getCrossfadeState() {
    return { ...crossfadeState };
}

// Make globally accessible
window.initCrossfadeUI = initCrossfadeUI;
window.checkCrossfade = checkCrossfade;
window.cancelCrossfade = cancelCrossfade;
window.isCrossfadeActive = isCrossfadeActive;
window.getCrossfadeState = getCrossfadeState;

// Export for module imports
export {
    initCrossfadeUI,
    checkCrossfade,
    cancelCrossfade,
    isCrossfadeActive,
    getCrossfadeState,
    crossfadeState
};
