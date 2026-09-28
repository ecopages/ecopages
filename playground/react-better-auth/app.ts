import { createApp } from '@ecopages/core/create-app';
import * as auth from './src/handlers/auth.server';

const app = await createApp();

await app
	.get('/api/auth/*', auth.authHandler)
	.post('/api/auth/*', auth.authHandler)
	.put('/api/auth/*', auth.authHandler)
	.delete('/api/auth/*', auth.authHandler)
	.options('/api/auth/*', auth.authHandler)
	.start();
