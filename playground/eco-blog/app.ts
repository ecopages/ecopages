import appConfig from './eco.config';
import { EcopagesApp } from '@ecopages/core/adapters/bun/create-app';
import * as auth from './src/handlers/auth';
import * as blog from './src/handlers/blog';
import * as admin from './src/handlers/admin';

const app = new EcopagesApp({ appConfig: appConfig });

app.get('/api/auth/*', auth.authHandler);
app.post('/api/auth/*', auth.authHandler);
app.get('/login', auth.loginPage);
app.get('/signup', auth.signupPage);

app.get('/', blog.list);
app.get('/posts/:slug', blog.detail);

app.group(
	'/admin',
	(r) => {
		r.get('/', admin.list);
		r.get('/new', admin.newPost);
		r.post('/posts', admin.createPost);
		r.get('/posts/:id', admin.editPost);
		r.post('/posts/:id', admin.updatePost);
		r.post('/posts/:id/delete', admin.deletePost);
		r.post('/upload', admin.uploadImage);
	},
	{
		middleware: [auth.authMiddleware],
	},
);

await app.start();
