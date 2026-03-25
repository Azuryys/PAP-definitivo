/**
 * Sleep Timer module - Auto-pause music after a set duration
 * Provides countdown timer with screen dimming effect
 */

// Sleep timer state
const sleepTimerState = {
    enabled: false,
    duration: 30, // Duration in minutes
    remainingSeconds: 0,
    intervalId: null,
    isRunning: false
};

// Storage key for persistence
const SLEEP_TIMER_STORAGE_KEY = 'music_player_sleep_timer';

/**
 * Format seconds to MM:SS display
 * @param {number} seconds 
 * @returns {string}
 */
function formatTime(seconds) {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}

/**
 * Update the timer display
 */
function updateTimerDisplay() {
    const display = document.getElementById('sleepTimerDisplay');
    if (display) {
        display.textContent = formatTime(sleepTimerState.remainingSeconds);
    }
}

/**
 * Update display to show selected duration (when not running)
 */
function updateDurationDisplay() {
    if (!sleepTimerState.isRunning) {
        const display = document.getElementById('sleepTimerDisplay');
        if (display) {
            display.textContent = formatTime(sleepTimerState.duration * 60);
        }
    }
}

/**
 * Show the sleep overlay (dark filter)
 */
function showSleepOverlay() {
    let overlay = document.getElementById('sleepOverlay');
    if (!overlay) {
        // Create overlay if it doesn't exist
        overlay = document.createElement('div');
        overlay.id = 'sleepOverlay';
        overlay.className = 'sleep-overlay';
        
        // Create timer badge on overlay
        const timerBadge = document.createElement('div');
        timerBadge.className = 'sleep-overlay-timer';
        timerBadge.id = 'sleepOverlayTimer';
        timerBadge.innerHTML = `
            <span class="sleep-overlay-icon">🌙</span>
            <span id="sleepOverlayTime">${formatTime(sleepTimerState.remainingSeconds)}</span>
            <button class="sleep-overlay-cancel" onclick="window.cancelSleepTimer()">Cancel</button>
        `;
        overlay.appendChild(timerBadge);
        
        document.body.appendChild(overlay);
    }
    
    // Update timer display on overlay
    const overlayTime = document.getElementById('sleepOverlayTime');
    if (overlayTime) {
        overlayTime.textContent = formatTime(sleepTimerState.remainingSeconds);
    }
    
    overlay.classList.add('active');
}

/**
 * Hide the sleep overlay
 */
function hideSleepOverlay() {
    const overlay = document.getElementById('sleepOverlay');
    if (overlay) {
        overlay.classList.remove('active');
    }
}

/**
 * Start the sleep timer countdown
 */
function startSleepTimer() {
    if (sleepTimerState.isRunning) {
        console.log('Sleep timer already running');
        return;
    }

    const durationInput = document.getElementById('sleepTimerDuration');
    if (durationInput) {
        sleepTimerState.duration = parseInt(durationInput.value) || 30;
    }
    
    sleepTimerState.remainingSeconds = sleepTimerState.duration * 60;
    sleepTimerState.isRunning = true;
    sleepTimerState.enabled = true;
    
    // Show overlay
    showSleepOverlay();
    
    // Update UI
    updateTimerDisplay();
    updateUIState();
    
    // Start countdown interval
    sleepTimerState.intervalId = setInterval(() => {
        sleepTimerState.remainingSeconds--;
        
        // Update displays
        updateTimerDisplay();
        const overlayTime = document.getElementById('sleepOverlayTime');
        if (overlayTime) {
            overlayTime.textContent = formatTime(sleepTimerState.remainingSeconds);
        }
        
        // Check if timer reached zero
        if (sleepTimerState.remainingSeconds <= 0) {
            timerComplete();
        }
    }, 1000);
    
    saveSleepTimerState();
    console.log(`✓ Sleep timer started: ${sleepTimerState.duration} minutes`);
}

/**
 * Timer completed - pause the music
 */
function timerComplete() {
    stopTimerInterval();
    hideSleepOverlay();
    
    // Pause the currently playing track
    if (window.pauseTrack) {
        window.pauseTrack();
        console.log('✓ Sleep timer: Music paused');
    }
    
    // Reset state
    sleepTimerState.isRunning = false;
    sleepTimerState.enabled = false;
    sleepTimerState.remainingSeconds = 0;
    
    updateUIState();
    saveSleepTimerState();
    
    // Show notification
    showTimerNotification();
}

/**
 * Show a brief notification when timer completes
 */
function showTimerNotification() {
    const overlay = document.getElementById('sleepOverlay');
    if (overlay) {
        overlay.innerHTML = `
            <div class="sleep-complete-message">
                <span class="sleep-complete-icon">💤</span>
                <span>Sleep timer ended</span>
            </div>
        `;
        overlay.classList.add('active', 'completing');
        
        setTimeout(() => {
            overlay.classList.remove('active', 'completing');
            overlay.innerHTML = '';
        }, 2000);
    }
}

/**
 * Cancel the running sleep timer
 */
function cancelSleepTimer() {
    stopTimerInterval();
    hideSleepOverlay();
    
    sleepTimerState.isRunning = false;
    sleepTimerState.enabled = false;
    sleepTimerState.remainingSeconds = 0;
    
    updateUIState();
    saveSleepTimerState();
    
    console.log('✓ Sleep timer cancelled');
}

/**
 * Stop the interval timer
 */
function stopTimerInterval() {
    if (sleepTimerState.intervalId) {
        clearInterval(sleepTimerState.intervalId);
        sleepTimerState.intervalId = null;
    }
}

/**
 * Update UI elements based on current state
 */
function updateUIState() {
    const toggle = document.getElementById('sleepTimerToggle');
    const panel = document.getElementById('sleepTimerPanel');
    const startBtn = document.getElementById('sleepTimerStartBtn');
    const cancelBtn = document.getElementById('sleepTimerCancelBtn');
    const durationInput = document.getElementById('sleepTimerDuration');
    const statusText = document.getElementById('sleepTimerStatus');
    
    if (toggle) {
        toggle.checked = sleepTimerState.enabled;
    }
    
    if (panel) {
        if (sleepTimerState.enabled || sleepTimerState.isRunning) {
            panel.classList.remove('hidden');
        } else {
            panel.classList.add('hidden');
        }
    }
    
    if (startBtn && cancelBtn) {
        if (sleepTimerState.isRunning) {
            startBtn.style.display = 'none';
            cancelBtn.style.display = 'block';
        } else {
            startBtn.style.display = 'block';
            cancelBtn.style.display = 'none';
        }
    }
    
    if (durationInput) {
        durationInput.disabled = sleepTimerState.isRunning;
        if (!sleepTimerState.isRunning) {
            durationInput.value = sleepTimerState.duration;
        }
    }
    
    if (statusText) {
        if (sleepTimerState.isRunning) {
            statusText.textContent = `Timer active: ${formatTime(sleepTimerState.remainingSeconds)} remaining`;
            statusText.classList.add('active');
        } else {
            statusText.textContent = 'Set a duration and start the timer';
            statusText.classList.remove('active');
        }
    }
    
    // Update display with selected duration when not running
    updateDurationDisplay();
}

/**
 * Save sleep timer state to localStorage
 */
function saveSleepTimerState() {
    const state = {
        enabled: sleepTimerState.enabled,
        duration: sleepTimerState.duration
    };
    localStorage.setItem(SLEEP_TIMER_STORAGE_KEY, JSON.stringify(state));
}

/**
 * Load sleep timer state from localStorage
 */
function loadSleepTimerState() {
    try {
        const saved = localStorage.getItem(SLEEP_TIMER_STORAGE_KEY);
        if (saved) {
            const state = JSON.parse(saved);
            sleepTimerState.duration = state.duration ?? 30;
            // Don't restore running state on reload
            console.log('✓ Loaded sleep timer settings');
        }
    } catch (error) {
        console.warn('Failed to load sleep timer state:', error);
    }
}

/**
 * Initialize sleep timer UI and event listeners
 */
function initSleepTimerUI() {
    // Load saved state
    loadSleepTimerState();
    
    // Toggle switch
    const toggle = document.getElementById('sleepTimerToggle');
    if (toggle) {
        toggle.checked = sleepTimerState.enabled;
        toggle.addEventListener('change', (e) => {
            sleepTimerState.enabled = e.target.checked;
            updateUIState();
            saveSleepTimerState();
        });
    }
    
    // Duration input
    const durationInput = document.getElementById('sleepTimerDuration');
    if (durationInput) {
        durationInput.value = sleepTimerState.duration;
        durationInput.addEventListener('input', (e) => {
            sleepTimerState.duration = parseInt(e.target.value) || 30;
            updateDurationDisplay();
            saveSleepTimerState();
        });
    }
    
    // Preset buttons
    const presetBtns = document.querySelectorAll('.sleep-preset-btn');
    presetBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            const minutes = parseInt(btn.dataset.minutes);
            if (durationInput && minutes) {
                durationInput.value = minutes;
                sleepTimerState.duration = minutes;
                updateDurationDisplay();
                saveSleepTimerState();
            }
        });
    });
    
    // Initialize display with current duration
    updateDurationDisplay();
    
    // Start button
    const startBtn = document.getElementById('sleepTimerStartBtn');
    if (startBtn) {
        startBtn.addEventListener('click', startSleepTimer);
    }
    
    // Cancel button
    const cancelBtn = document.getElementById('sleepTimerCancelBtn');
    if (cancelBtn) {
        cancelBtn.addEventListener('click', cancelSleepTimer);
    }
    
    // Initialize UI state
    updateUIState();
    
    console.log('✓ Sleep timer UI initialized');
}

// Make globally accessible
window.initSleepTimerUI = initSleepTimerUI;
window.startSleepTimer = startSleepTimer;
window.cancelSleepTimer = cancelSleepTimer;

// Export for module imports
export {
    initSleepTimerUI,
    startSleepTimer,
    cancelSleepTimer,
    sleepTimerState
};
