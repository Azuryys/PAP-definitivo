/**
 * Equalizer module - Audio processing with Web Audio API
 * Provides 10-band graphic EQ with presets and quick effects
 */

// Equalizer state
const eqState = {
    enabled: false,
    audioContext: null,
    sourceNode: null,
    gainNode: null,
    filters: [],
    currentPreset: 'flat',
    bands: {
        32: 0, 64: 0, 125: 0, 250: 0, 500: 0,
        '1k': 0, '2k': 0, '4k': 0, '8k': 0, '16k': 0
    },
    effects: {
        bassBoost: 0,
        trebleBoost: 0
    }
};

// Frequency bands in Hz
const FREQUENCIES = [32, 64, 125, 250, 500, 1000, 2000, 4000, 8000, 16000];
const BAND_KEYS = ['32', '64', '125', '250', '500', '1k', '2k', '4k', '8k', '16k'];

// EQ Presets - values in dB for each band
const EQ_PRESETS = {
    'flat': [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    'rock': [5, 4, 2, 0, -1, 1, 3, 4, 5, 5],
    'pop': [1, 2, 4, 5, 4, 2, 1, 2, 3, 3],
    'jazz': [4, 3, 1, 2, -1, -1, 0, 2, 3, 4],
    'classical': [5, 4, 3, 2, -1, -2, 0, 2, 3, 4],
    'bass-boost': [8, 7, 5, 3, 1, 0, 0, 0, 0, 0],
    'treble-boost': [0, 0, 0, 0, 0, 1, 3, 5, 7, 8],
    'vocal': [-2, -1, 0, 3, 5, 5, 4, 2, 0, -1],
    'electronic': [5, 4, 1, 0, -2, 2, 1, 3, 5, 5],
    'acoustic': [4, 3, 2, 1, 2, 2, 3, 3, 3, 2]
};

/**
 * Initialize the equalizer audio context and connect to audio element
 * @param {HTMLAudioElement} audioElement - The audio element to connect
 */
function initEqualizer(audioElement) {
    if (!audioElement) {
        console.error('Equalizer: No audio element provided');
        return;
    }

    // Load saved state
    loadEqState();

    // Only create audio context on user interaction
    if (!eqState.audioContext) {
        try {
            eqState.audioContext = new (window.AudioContext || window.webkitAudioContext)();
            console.log('✓ AudioContext created for equalizer');
        } catch (error) {
            console.error('Failed to create AudioContext:', error);
            return;
        }
    }

    // Resume context if suspended
    if (eqState.audioContext.state === 'suspended') {
        eqState.audioContext.resume();
    }

    // Only create source node once
    if (!eqState.sourceNode) {
        try {
            eqState.sourceNode = eqState.audioContext.createMediaElementSource(audioElement);
            console.log('✓ MediaElementSource created');
        } catch (error) {
            // Element may already be connected
            console.warn('Could not create MediaElementSource (may already exist):', error);
            return;
        }
    }

    // Create gain node for overall volume
    if (!eqState.gainNode) {
        eqState.gainNode = eqState.audioContext.createGain();
        eqState.gainNode.connect(eqState.audioContext.destination);
    }

    // Create filter nodes for each frequency band
    createFilters();

    // Connect the chain
    connectAudioChain();

    // Apply saved settings
    applyCurrentSettings();

    console.log('✓ Equalizer initialized');
}

/**
 * Create BiquadFilter nodes for each frequency band
 */
function createFilters() {
    // Clear existing filters
    eqState.filters = [];

    for (let i = 0; i < FREQUENCIES.length; i++) {
        const filter = eqState.audioContext.createBiquadFilter();
        
        // Use peaking filter for most bands, lowshelf for lowest, highshelf for highest
        if (i === 0) {
            filter.type = 'lowshelf';
        } else if (i === FREQUENCIES.length - 1) {
            filter.type = 'highshelf';
        } else {
            filter.type = 'peaking';
            filter.Q.value = 1.4; // Quality factor for bandwidth
        }
        
        filter.frequency.value = FREQUENCIES[i];
        filter.gain.value = 0;
        
        eqState.filters.push(filter);
    }
}

/**
 * Connect the audio processing chain
 */
function connectAudioChain() {
    if (!eqState.sourceNode || eqState.filters.length === 0) return;

    // Disconnect existing connections
    try {
        eqState.sourceNode.disconnect();
    } catch (e) {
        // Ignore if not connected
    }

    if (eqState.enabled) {
        // Connect: source → filter chain → gain → destination
        eqState.sourceNode.connect(eqState.filters[0]);
        
        for (let i = 0; i < eqState.filters.length - 1; i++) {
            eqState.filters[i].connect(eqState.filters[i + 1]);
        }
        
        eqState.filters[eqState.filters.length - 1].connect(eqState.gainNode);
    } else {
        // Bypass: source → gain → destination
        eqState.sourceNode.connect(eqState.gainNode);
    }
}

/**
 * Set a specific band's gain value
 * @param {number} bandIndex - Index of the band (0-9)
 * @param {number} gainValue - Gain in dB (-12 to +12)
 */
function setBandGain(bandIndex, gainValue) {
    if (bandIndex < 0 || bandIndex >= eqState.filters.length) return;
    
    // Clamp value
    gainValue = Math.max(-12, Math.min(12, gainValue));
    
    eqState.filters[bandIndex].gain.value = gainValue;
    eqState.bands[BAND_KEYS[bandIndex]] = gainValue;
    
    // Mark as custom if different from current preset
    if (eqState.currentPreset !== 'custom') {
        const presetValues = EQ_PRESETS[eqState.currentPreset];
        if (presetValues && presetValues[bandIndex] !== gainValue) {
            eqState.currentPreset = 'custom';
            updatePresetSelect();
        }
    }
    
    saveEqState();
}

/**
 * Apply a preset to all bands
 * @param {string} presetName - Name of the preset
 */
function applyPreset(presetName) {
    const values = EQ_PRESETS[presetName];
    if (!values) {
        console.warn('Unknown preset:', presetName);
        return;
    }
    
    eqState.currentPreset = presetName;
    
    for (let i = 0; i < values.length; i++) {
        if (eqState.filters[i]) {
            eqState.filters[i].gain.value = values[i];
            eqState.bands[BAND_KEYS[i]] = values[i];
        }
    }
    
    // Reset quick effects for presets (except bass-boost and treble-boost)
    if (presetName === 'bass-boost') {
        eqState.effects.bassBoost = 8;
        eqState.effects.trebleBoost = 0;
    } else if (presetName === 'treble-boost') {
        eqState.effects.bassBoost = 0;
        eqState.effects.trebleBoost = 8;
    } else {
        eqState.effects.bassBoost = 0;
        eqState.effects.trebleBoost = 0;
    }
    
    updateAllSliders();
    saveEqState();
    
    console.log('✓ Preset applied:', presetName);
}

/**
 * Set bass boost effect
 * @param {number} value - Boost amount (0-12 dB)
 */
function setBassBoost(value) {
    eqState.effects.bassBoost = Math.max(0, Math.min(12, value));
    
    // Apply boost to low frequency bands (32, 64, 125 Hz)
    const bassIndices = [0, 1, 2];
    bassIndices.forEach((index, i) => {
        const boost = eqState.effects.bassBoost * (1 - i * 0.25); // Gradual reduction
        if (eqState.filters[index]) {
            eqState.filters[index].gain.value = boost;
            eqState.bands[BAND_KEYS[index]] = boost;
        }
    });
    
    updateBandSliders();
    eqState.currentPreset = 'custom';
    updatePresetSelect();
    saveEqState();
}

/**
 * Set treble boost effect
 * @param {number} value - Boost amount (0-12 dB)
 */
function setTrebleBoost(value) {
    eqState.effects.trebleBoost = Math.max(0, Math.min(12, value));
    
    // Apply boost to high frequency bands (4k, 8k, 16k Hz)
    const trebleIndices = [7, 8, 9];
    trebleIndices.forEach((index, i) => {
        const boost = eqState.effects.trebleBoost * (0.5 + i * 0.25); // Gradual increase
        if (eqState.filters[index]) {
            eqState.filters[index].gain.value = boost;
            eqState.bands[BAND_KEYS[index]] = boost;
        }
    });
    
    updateBandSliders();
    eqState.currentPreset = 'custom';
    updatePresetSelect();
    saveEqState();
}

/**
 * Enable or disable the equalizer
 * @param {boolean} enabled
 */
function setEqualizerEnabled(enabled) {
    eqState.enabled = enabled;
    connectAudioChain();
    saveEqState();
    
    // Update UI
    const panel = document.getElementById('equalizerPanel');
    if (panel) {
        if (enabled) {
            panel.classList.remove('hidden');
        } else {
            panel.classList.add('hidden');
        }
    }
    
    console.log('Equalizer', enabled ? 'enabled' : 'disabled');
}

/**
 * Reset equalizer to flat response
 */
function resetEqualizer() {
    applyPreset('flat');
    eqState.effects.bassBoost = 0;
    eqState.effects.trebleBoost = 0;
    updateEffectSliders();
}

/**
 * Apply current saved settings to filters
 */
function applyCurrentSettings() {
    BAND_KEYS.forEach((key, index) => {
        if (eqState.filters[index]) {
            eqState.filters[index].gain.value = eqState.bands[key];
        }
    });
}

// ─── UI Update Functions ───────────────────────────────────────────────────

/**
 * Update the preset select dropdown
 */
function updatePresetSelect() {
    const select = document.getElementById('eqPresetSelect');
    if (select) {
        select.value = eqState.currentPreset;
    }
}

/**
 * Update all band sliders to match current state
 */
function updateBandSliders() {
    const sliderIds = ['eqBand32', 'eqBand64', 'eqBand125', 'eqBand250', 'eqBand500',
                       'eqBand1k', 'eqBand2k', 'eqBand4k', 'eqBand8k', 'eqBand16k'];
    
    sliderIds.forEach((id, index) => {
        const slider = document.getElementById(id);
        if (slider) {
            slider.value = eqState.bands[BAND_KEYS[index]];
        }
    });
}

/**
 * Update effect sliders (bass/treble boost)
 */
function updateEffectSliders() {
    const bassSlider = document.getElementById('eqBassBoost');
    const trebleSlider = document.getElementById('eqTrebleBoost');
    const bassValue = document.getElementById('eqBassBoostValue');
    const trebleValue = document.getElementById('eqTrebleBoostValue');
    
    if (bassSlider) bassSlider.value = eqState.effects.bassBoost;
    if (trebleSlider) trebleSlider.value = eqState.effects.trebleBoost;
    if (bassValue) bassValue.textContent = `${eqState.effects.bassBoost} dB`;
    if (trebleValue) trebleValue.textContent = `${eqState.effects.trebleBoost} dB`;
}

/**
 * Update all UI sliders
 */
function updateAllSliders() {
    updateBandSliders();
    updateEffectSliders();
    updatePresetSelect();
}

// ─── State Persistence ─────────────────────────────────────────────────────

const EQ_STORAGE_KEY = 'music_player_equalizer';

/**
 * Save equalizer state to localStorage
 */
function saveEqState() {
    const state = {
        enabled: eqState.enabled,
        currentPreset: eqState.currentPreset,
        bands: { ...eqState.bands },
        effects: { ...eqState.effects }
    };
    
    localStorage.setItem(EQ_STORAGE_KEY, JSON.stringify(state));
}

/**
 * Load equalizer state from localStorage
 */
function loadEqState() {
    try {
        const saved = localStorage.getItem(EQ_STORAGE_KEY);
        if (saved) {
            const state = JSON.parse(saved);
            eqState.enabled = state.enabled ?? false;
            eqState.currentPreset = state.currentPreset ?? 'flat';
            eqState.bands = state.bands ?? eqState.bands;
            eqState.effects = state.effects ?? eqState.effects;
            console.log('✓ Loaded equalizer settings');
        }
    } catch (error) {
        console.warn('Failed to load equalizer state:', error);
    }
}

// ─── UI Event Setup ────────────────────────────────────────────────────────

/**
 * Initialize equalizer UI event listeners
 * Called when settings page is opened
 */
function initEqualizerUI() {
    // Load saved state and update UI
    loadEqState();
    
    // Toggle switch
    const toggle = document.getElementById('equalizerToggle');
    if (toggle) {
        toggle.checked = eqState.enabled;
        toggle.addEventListener('change', (e) => {
            setEqualizerEnabled(e.target.checked);
        });
    }
    
    // Panel visibility
    const panel = document.getElementById('equalizerPanel');
    if (panel) {
        if (eqState.enabled) {
            panel.classList.remove('hidden');
        } else {
            panel.classList.add('hidden');
        }
    }
    
    // Preset selector
    const presetSelect = document.getElementById('eqPresetSelect');
    if (presetSelect) {
        presetSelect.value = eqState.currentPreset;
        presetSelect.addEventListener('change', (e) => {
            applyPreset(e.target.value);
        });
    }
    
    // Band sliders
    const sliderIds = ['eqBand32', 'eqBand64', 'eqBand125', 'eqBand250', 'eqBand500',
                       'eqBand1k', 'eqBand2k', 'eqBand4k', 'eqBand8k', 'eqBand16k'];
    
    sliderIds.forEach((id, index) => {
        const slider = document.getElementById(id);
        if (slider) {
            slider.value = eqState.bands[BAND_KEYS[index]];
            slider.addEventListener('input', (e) => {
                setBandGain(index, parseFloat(e.target.value));
            });
        }
    });
    
    // Bass boost slider
    const bassSlider = document.getElementById('eqBassBoost');
    const bassValue = document.getElementById('eqBassBoostValue');
    if (bassSlider) {
        bassSlider.value = eqState.effects.bassBoost;
        if (bassValue) bassValue.textContent = `${eqState.effects.bassBoost} dB`;
        
        bassSlider.addEventListener('input', (e) => {
            const val = parseFloat(e.target.value);
            setBassBoost(val);
            if (bassValue) bassValue.textContent = `${val} dB`;
        });
    }
    
    // Treble boost slider
    const trebleSlider = document.getElementById('eqTrebleBoost');
    const trebleValue = document.getElementById('eqTrebleBoostValue');
    if (trebleSlider) {
        trebleSlider.value = eqState.effects.trebleBoost;
        if (trebleValue) trebleValue.textContent = `${eqState.effects.trebleBoost} dB`;
        
        trebleSlider.addEventListener('input', (e) => {
            const val = parseFloat(e.target.value);
            setTrebleBoost(val);
            if (trebleValue) trebleValue.textContent = `${val} dB`;
        });
    }
    
    // Reset button
    const resetBtn = document.getElementById('eqResetBtn');
    if (resetBtn) {
        resetBtn.addEventListener('click', resetEqualizer);
    }
    
    console.log('✓ Equalizer UI initialized');
}

// ─── Exports ───────────────────────────────────────────────────────────────

export {
    initEqualizer,
    initEqualizerUI,
    setEqualizerEnabled,
    setBandGain,
    applyPreset,
    setBassBoost,
    setTrebleBoost,
    resetEqualizer,
    eqState,
    EQ_PRESETS
};

// Make globally accessible
window.initEqualizer = initEqualizer;
window.initEqualizerUI = initEqualizerUI;
window.setEqualizerEnabled = setEqualizerEnabled;
window.applyEqPreset = applyPreset;
window.resetEqualizer = resetEqualizer;
