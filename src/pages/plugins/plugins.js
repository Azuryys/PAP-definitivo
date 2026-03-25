/**
 * Plugins page logic
 * - Manages plugin features like Equalizer, Sleep Timer, and Crossfade
 */

import { initEqualizerUI } from './equalizer.js';
import { initSleepTimerUI } from './sleeptimer.js';
import { initCrossfadeUI } from './crossfade.js';

let pluginsInitialized = false;

/**
 * Initialize the plugins page UI and event listeners
 */
function initPlugins() {
    console.log('Initializing plugins page');

    // Always initialize equalizer UI (to restore saved state)
    if (window.initEqualizerUI) {
        window.initEqualizerUI();
    }
    
    // Initialize sleep timer UI
    if (window.initSleepTimerUI) {
        window.initSleepTimerUI();
    }
    
    // Initialize crossfade UI
    if (window.initCrossfadeUI) {
        window.initCrossfadeUI();
    }

    if (pluginsInitialized) return;
    pluginsInitialized = true;

    console.log('✓ Plugins page initialized');
}

// Export for module imports
export { initPlugins };

// Make globally accessible
window.initPlugins = initPlugins;
