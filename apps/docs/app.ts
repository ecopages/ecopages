import { installLightDomShim } from '@ecopages/radiant/server/light-dom-shim';
import { createApp } from '@ecopages/core/create-app';
import appConfig from './eco.config';

installLightDomShim();

export const app = await createApp({ appConfig });

await app.start();
