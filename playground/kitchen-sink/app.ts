import { createApp } from '@ecopages/core/create-app';
import { HttpError } from '@ecopages/core/errors';
import appConfig from './eco.config';
import * as api from './src/handlers/api';
import { adminGroup } from './src/handlers/admin';
import { releaseNotes } from './src/data/demo-data';

const isViteHosted = process.env.ECOPAGES_KITCHEN_SINK_HOST === 'vite';

export const app = await createApp({
	appConfig,
	runtime: isViteHosted
		? {
				embedded: true,
			}
		: undefined,
});

app.get('/explicit/team', async (ctx) => {
	return await ctx.renderServerModule(new URL('./src/views/explicit-team-view.kita.tsx', import.meta.url));
})
	.get('/latest', async (ctx) => {
		const latestRelease = releaseNotes[releaseNotes.length - 1]!;
		return await ctx.renderServerModule(new URL('./src/views/latest-release-view.kita.tsx', import.meta.url), {
			release: latestRelease,
		});
	})
	.add(api.ping)
	.add(api.echo)
	.add(api.catalog)
	.group(adminGroup);

app.onError((error, ctx) => {
	if (error instanceof HttpError) {
		return ctx.json(error.toJSON(), { status: error.status });
	}

	console.error('Unexpected error:', error);
	return ctx.json({ error: 'Internal Server Error' }, { status: 500 });
});

if (!isViteHosted) {
	await app.start();
}
