import { createApp } from '@ecopages/core/adapters/bun/create-app';
import appConfig from './eco.config';

const app = await createApp({ appConfig });

await app.start();
