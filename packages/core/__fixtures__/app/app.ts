import { EcopagesApp } from '../../src/adapters/bun/create-app';
import appConfig from './eco.config';

const app = new EcopagesApp({ appConfig });

await app.start();
