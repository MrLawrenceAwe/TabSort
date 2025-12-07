import { initialisePopup } from './init.js';
import { logAndSend } from './runtime.js';
import { MESSAGE_TYPES } from '../shared/constants.js';
import { toErrorMessage } from '../shared/utils.js';

initialisePopup().catch((error) => {
  logAndSend(MESSAGE_TYPES.ERROR, `Failed to initialise popup: ${toErrorMessage(error)}`);
});
