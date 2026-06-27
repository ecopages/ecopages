import { EcopagesApp } from '@ecopages/core/create-app';
import appConfig from './eco.config';

const app = new EcopagesApp({ appConfig });

await app.start();
