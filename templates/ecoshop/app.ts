import { createApp } from '@ecopages/core/create-app';
import * as agents from './src/handlers/agents.server';

const app = await createApp();

/**
 * These URLs end in a file extension or sit under a dot folder, which an endpoint file cannot answer, so they are
 * Explicit Routes.
 */
await app
	.get('/llms.txt', agents.llmsTxtHandler)
	.get('/products/:handle/index.md', agents.productMarkdownHandler)
	.get('/.well-known/ucp', agents.ucpProfileHandler)
	.start();
