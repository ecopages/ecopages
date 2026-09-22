import { redirect } from '@ecopages/core';
import { createApp } from '@ecopages/core/create-app';
import { env } from './src/lib/env';
import { createMarkdownRoute, installMarkdownNegotiation } from './src/lib/md-response';
import { createSearchRoute, searchWiki } from './src/lib/search';
import { getWikiHomePath, getWikiMarkdown, matchWikiMarkdownPath } from './src/lib/wiki';

const app = await createApp();

const catalogRedirect = () => redirect('/', 307);
app.get('/wiki', catalogRedirect);
app.head('/wiki', catalogRedirect);

if (env.WIKI_HOME_SLUG) {
	const homeRedirect = async () => redirect(await getWikiHomePath(), 307);
	app.get('/', homeRedirect);
	app.head('/', homeRedirect);
}

app.add(createSearchRoute('/api/search', searchWiki));
app.add(
	createMarkdownRoute({
		path: '/api/wiki/[...slug]',
		getMarkdown: getWikiMarkdown,
	}),
);

await installMarkdownNegotiation(app, {
	match: matchWikiMarkdownPath,
	getMarkdown: getWikiMarkdown,
});

await app.start();
