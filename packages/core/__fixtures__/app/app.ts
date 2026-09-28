import { createApp } from '../../src/adapters/create-app.ts';

const app = await createApp();

await app.start();
