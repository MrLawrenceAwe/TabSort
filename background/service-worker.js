import { registerMessageRouter } from './messaging/router.js';
import { registerTabAndNavigationListeners } from './tabs/listeners.js';
import { initializeWindowLifecycle, resetTrackedWindow } from './windows/lifecycle.js';

registerMessageRouter();
registerTabAndNavigationListeners({ onTrackedWindowClosed: resetTrackedWindow });
initializeWindowLifecycle();
