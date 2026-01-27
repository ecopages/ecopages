import appConfig from './eco.config';
import { EcopagesApp } from '@ecopages/core/adapters/bun/create-app';
import * as auth from './src/handlers/auth';
import * as blog from './src/handlers/blog';
import { adminGroup } from './src/handlers/admin';

const app = new EcopagesApp({ appConfig: appConfig })
	.get('/api/auth/*', auth.authHandler)
	.post('/api/auth/*', auth.authHandler)
	.static('/login', () => import('./src/views/auth/login.kita'))
	.static('/signup', () => import('./src/views/auth/signup.kita'))
	.get(blog.list)
	.get(blog.detail)
	.group(adminGroup);

await app.start();
