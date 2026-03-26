import { registerRuntimeMessageListener } from './runtime-events.js';
import { registerTabAndNavigationListeners } from './tab-events.js';
import { initializeWindowLifecycle, resetTrackedWindow } from './window-lifecycle.js';

registerRuntimeMessageListener();
registerTabAndNavigationListeners({ onTrackedWindowClosed: resetTrackedWindow });
initializeWindowLifecycle();
