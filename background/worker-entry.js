import { registerMessageRouter } from './message-router.js';
import { registerTabAndNavigationListeners } from './tab-events.js';
import { initializeWindowLifecycle, resetTrackedWindow } from './window-lifecycle.js';

registerMessageRouter();
registerTabAndNavigationListeners({ onTrackedWindowClosed: resetTrackedWindow });
initializeWindowLifecycle();
