import { registerMessageHandlers } from './messages.js';
import { registerTabAndNavigationListeners } from './tab-events.js';
import { initializeWindowLifecycle, resetTrackedWindow } from './window-lifecycle.js';

registerMessageHandlers();
registerTabAndNavigationListeners({ onTrackedWindowClosed: resetTrackedWindow });
initializeWindowLifecycle();
