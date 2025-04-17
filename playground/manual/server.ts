import { EcopagesApp } from '@ecopages/core/adapters/bun/create-app';
import appConfig from './eco.config';

const app = new EcopagesApp({ appConfig });

await app.start();
