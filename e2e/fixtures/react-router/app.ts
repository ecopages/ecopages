import { createApp } from '@ecopages/core/create-app';
import { onAppStartCallback } from '../../playwright/on-app-start';
import appConfig from './eco.config';

export const app = await createApp({ appConfig });

await app.start(onAppStartCallback);
