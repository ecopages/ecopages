import { EcopagesApp } from '@ecopages/core/bun/create-app';
import appConfig from './eco.config';

const app = new EcopagesApp({ appConfig });

await app.start();
