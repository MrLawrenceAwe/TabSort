import { registerMessageRouter } from './message-router.js';
import { registerTabAndNavigationListeners } from './tab-events.js';
import { initializeWindowLifecycle, resetManagedWindow } from './window-lifecycle.js';

registerMessageRouter();
registerTabAndNavigationListeners({ onManagedWindowClosed: resetManagedWindow });
initializeWindowLifecycle();
