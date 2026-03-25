/**
 * This file will automatically be loaded by webpack and run in the "renderer" context.
 * To learn more about the differences between the "main" and the "renderer" context in
 * Electron, visit:
 *
 * https://electronjs.org/docs/tutorial/process-model
 *
 * By default, Node.js integration in this file is disabled. When enabling Node.js integration
 * in a renderer process, please be aware of potential security implications. You can read
 * more about security risks here:
 *
 * https://electronjs.org/docs/tutorial/security
 *
 * To enable Node.js integration in this file, open up `main.js` and enable the `nodeIntegration`
 * flag:
 *
 * ```
 *  // Create the browser window.
 *  mainWindow = new BrowserWindow({
 *    width: 800,
 *    height: 600,
 *    webPreferences: {
 *      nodeIntegration: true
 *    }
 *  });
 * ```
 */

// Styles - split into modular CSS files
import './css/base.css';      // Base styles, variables, and common utilities
import './css/setup.css';     // Setup page styles
import './css/sidebar.css';   // Sidebar and navigation styles
import './css/modal.css';     // Modal and form styles
import './css/playlist.css';  // Playlist item styles
import './css/player.css';    // Player bar and fullscreen art styles
import './css/settings.css';  // Settings page styles
import './css/plugins.css';   // Plugins page and plugin-specific styles (equalizer, sleep timer, crossfade)

// Setup page scripts
import { initSetup } from './pages/setup/setup.js';

// Player page scripts - import first so initPlayer is available
import { initPlayer } from './pages/player/player.js';

// Starter page scripts
import './pages/starter/starter.js';

// Settings page scripts
import { initSettings } from './pages/settings/settings.js';

// Plugins page scripts
import { initPlugins } from './pages/plugins/plugins.js';

// Sleep timer plugin
import { initSleepTimerUI } from './pages/plugins/sleeptimer.js';

// Import main script for page navigation and initialization
import './script.js';

// Make functions globally accessible
window.initPlayer = initPlayer;
window.initSetup = initSetup;
window.initSettings = initSettings;
window.initPlugins = initPlugins;

document.addEventListener('DOMContentLoaded', async () => {
  // Check setup and initialize app
  initApp();

  // Load custom theme if saved
  try {
    const result = await window.electronAPI.loadCustomCSS();
    if (result.success && result.css) {
      let styleEl = document.getElementById('custom-theme');
      if (!styleEl) {
        styleEl = document.createElement('style');
        styleEl.id = 'custom-theme';
        document.head.appendChild(styleEl);
      }
      styleEl.textContent = result.css;
      console.log('✓ Custom theme loaded on startup');
    }
  } catch (err) {
    console.warn('Could not load custom theme:', err);
  }
});

console.log('👋 Music player app loaded by "renderer.js"');
