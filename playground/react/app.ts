import { createApp } from '@ecopages/core';
import appConfig from './eco.config';

const app = await createApp({ appConfig });

await app.start();
