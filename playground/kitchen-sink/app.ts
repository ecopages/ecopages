import { createApp } from '@ecopages/core/create-app';
import { HttpError } from '@ecopages/core/errors';
import appConfig from './eco.config';
import * as api from './src/handlers/api';
import { adminGroup } from './src/handlers/admin';
import { releaseNotes } from './src/data/demo-data';

const app = await createApp({ appConfig });

app.get('/explicit/team', async (ctx) => {
	const { default: ExplicitTeamView } = await import('./src/views/explicit-team-view.kita');
	return ctx.render(ExplicitTeamView, {});
})
	.get('/latest', async (ctx) => {
		const { default: LatestReleaseView } = await import('./src/views/latest-release-view.kita');
		const latestRelease = releaseNotes[releaseNotes.length - 1]!;
		return ctx.render(LatestReleaseView, { release: latestRelease });
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

await app.start();
