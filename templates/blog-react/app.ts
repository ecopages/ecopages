import path from 'node:path';
import { createApp } from '@ecopages/core/create-app';
import { POSTS_CONTENT_DIR, comparePosts, postsFrontmatterSchema } from './src/content/posts';
import { generateRss } from './src/content/generate-rss';
import appConfig from './eco.config';

const appRoot = import.meta.dirname;
const app = await createApp({ appConfig });

await generateRss({
	appRoot,
	baseUrl: appConfig.baseUrl,
	contentRoot: path.join(appRoot, 'src', POSTS_CONTENT_DIR),
	schema: postsFrontmatterSchema,
	orderBy: comparePosts,
	postPathPrefix: '/posts',
	channel: {
		title: 'EcoBlog',
		description: 'A content-driven Ecopages React blog.',
	},
});

await app.start();
