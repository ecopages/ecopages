import { EcopagesApp } from '@ecopages/core';
import appConfig from './eco.config';

const app = new EcopagesApp({ appConfig });

await app.start();
