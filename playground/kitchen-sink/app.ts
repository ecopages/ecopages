import { createApp } from '@ecopages/core/create-app';
import { HttpError } from '@ecopages/core/errors';
import * as api from './src/handlers/api';
import { adminGroup } from './src/handlers/admin';
import { releaseNotes } from './src/data/demo-data';
import { chatRoomWebsocketHandler } from './src/handlers/ws-chat-room';
import ExplicitTeamView from './src/views/explicit-team-view.kita.tsx';
import ExplicitReactIslandView from './src/views/explicit-react-island.kita.tsx';
import LatestReleaseView from './src/views/latest-release-view.kita.tsx';

const isE2ERun = process.env.ECOPAGES_CROSS_INTEGRATION_E2E === 'true';

export const app = await createApp({
	serverOptions: isE2ERun ? { idleTimeout: 255 } : undefined,
});

/**
 * Register the room-based WebSocket chat handler.
 *
 * @remarks
 * One registration matches every room id. The adapter resolves `params.roomId`
 * per connection and the handler uses `context()` to build the typed
 * per-connection state. This demonstrates the long-term scalable pattern: a
 * single entry point supports effectively infinite rooms.
 *
 * The framework handles the HTTP→WebSocket upgrade implicitly. No manual GET
 * route registration is required.
 */
app.websocket('/ws/chat/:roomId', chatRoomWebsocketHandler);

app.get('/explicit/team', async (ctx) => {
	return await ctx.render(ExplicitTeamView);
})
	.get('/explicit/react-island', async (ctx) => {
		return await ctx.render(ExplicitReactIslandView);
	})
	.get('/latest', async (ctx) => {
		const latestRelease = releaseNotes[releaseNotes.length - 1]!;
		return await ctx.render(LatestReleaseView, {
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

await app.start();
