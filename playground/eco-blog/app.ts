import { createApp } from '@ecopages/core/create-app';
import * as auth from './src/handlers/auth';
import * as blog from './src/handlers/blog';
import { adminGroup } from './src/handlers/admin';

const app = await createApp();

await app
	.get('/api/auth/*', auth.authHandler)
	.post('/api/auth/*', auth.authHandler)
	.static('/login', './src/views/auth/login.kita')
	.static('/signup', './src/views/auth/signup.kita')
	.add(blog.list)
	.add(blog.detail)
	.group(adminGroup)
	.start();
