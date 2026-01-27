import appConfig from './eco.config';
import { EcopagesApp } from '@ecopages/core/adapters/bun/create-app';
import * as auth from './src/handlers/auth';
import * as blog from './src/handlers/blog';
import { adminGroup } from './src/handlers/admin';
import { LoginView } from './src/views/auth/login.kita';
import { SignupView } from './src/views/auth/signup.kita';

const app = new EcopagesApp({ appConfig: appConfig })
	.get('/api/auth/*', auth.authHandler)
	.post('/api/auth/*', auth.authHandler)
	.static('/login', LoginView)
	.static('/signup', SignupView)
	.get(blog.list)
	.get(blog.detail)
	.group(adminGroup);

await app.start();
