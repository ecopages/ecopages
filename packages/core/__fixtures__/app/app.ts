import { createApp } from '../../src/adapters/create-app.ts';
import appConfig from './eco.config';

const app = await createApp({ appConfig });

await app.start();
