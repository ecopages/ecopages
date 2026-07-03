import type { OnAppStartCallback } from '../../packages/core/src/adapters/create-app.ts';
import { formatServerReadyMessage } from '../../packages/core/src/dev/server-ready-message.ts';

/** Logs `[@ecopages/ready]` for Playwright `webServer` stdout matching in this repo. */
export const onAppStartCallback: OnAppStartCallback = ({ origin }) => {
	console.log(formatServerReadyMessage(origin));
};
