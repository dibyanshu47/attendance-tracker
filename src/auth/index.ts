// Public auth surface: identity (login + ID-token decode), the Drive token
// client, and the GIS load guard.

export type { GoogleIdentity, DriveTokenProvider } from './types';

export { initGoogleLogin, renderGoogleButton, disableAutoSelect, decodeIdToken } from './identity';

export { GisDriveTokenProvider, DRIVE_APPDATA_SCOPE } from './driveToken';

export { isGisReady, waitForGis } from './gisLoader';
