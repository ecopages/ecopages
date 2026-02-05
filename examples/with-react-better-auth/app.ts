import { EcopagesApp } from '@ecopages/core/adapters/bun/create-app';
import appConfig from './eco.config';
import * as auth from './src/handlers/auth.server';

new EcopagesApp({ appConfig })
	.get('/api/auth/*', auth.authHandler)
	.post('/api/auth/*', auth.authHandler)
	.put('/api/auth/*', auth.authHandler)
	.delete('/api/auth/*', auth.authHandler)
	.options('/api/auth/*', auth.authHandler)
	.start();
