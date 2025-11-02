import { initialisePopup } from './popup/init.js';
import { logAndSend } from './popup/runtime.js';
import { MESSAGE_TYPES } from './shared/constants.js';

initialisePopup().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  logAndSend(MESSAGE_TYPES.ERROR, `Failed to initialise popup: ${message}`);
});
