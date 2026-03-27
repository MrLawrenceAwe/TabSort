import { registerRuntimeMessageRouter } from './runtime-message-router.js';
import { registerTabAndNavigationListeners } from './tab-events.js';
import { initializeWindowLifecycle, resetTrackedWindow } from './window-lifecycle.js';

registerRuntimeMessageRouter();
registerTabAndNavigationListeners({ onTrackedWindowClosed: resetTrackedWindow });
initializeWindowLifecycle();
