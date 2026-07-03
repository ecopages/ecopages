import { createApp } from '@ecopages/core/create-app';
import { formatServerReadyMessage } from '@ecopages/core/dev/server-ready-message';
import appConfig from './eco.config';

export const app = await createApp({ appConfig });

await app.start(({ origin }) => {
	console.log(formatServerReadyMessage(origin));
});
