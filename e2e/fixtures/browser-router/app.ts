import { createApp } from '@ecopages/core/create-app';
import appConfig from './eco.config';

export const app = await createApp({ appConfig });

await app.start();
