import { createApp } from '@ecopages/core/create-app';
import appConfig from './eco.config';

const app = await createApp({ appConfig });
await app.start();
