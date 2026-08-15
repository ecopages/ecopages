import { redirect } from '@ecopages/core';
import { createApp } from '@ecopages/core/create-app';
import { createMarkdownRoute, installMarkdownNegotiation } from './src/lib/md-response';
import { createSearchRoute, searchWiki } from './src/lib/search';
import { getWikiHomePath, getWikiMarkdown, matchWikiMarkdownPath } from './src/lib/wiki';
import appConfig from './eco.config';

const homeRedirect = async () => redirect(await getWikiHomePath(), 307);

const app = await createApp({ appConfig });

app.get('/', homeRedirect);
app.head('/', homeRedirect);
app.get('/wiki', homeRedirect);
app.head('/wiki', homeRedirect);

app.add(createSearchRoute('/api/search', searchWiki));
app.add(
	createMarkdownRoute({
		path: '/api/wiki/:slug',
		getMarkdown: getWikiMarkdown,
	}),
);

await installMarkdownNegotiation(app, {
	match: matchWikiMarkdownPath,
	getMarkdown: getWikiMarkdown,
});

await app.start();
