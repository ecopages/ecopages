import { createApp } from '@ecopages/core/create-app';
import { HttpError } from '@ecopages/core/errors';
import appConfig from './eco.config';
import * as api from './src/handlers/api';
import { adminGroup } from './src/handlers/admin';
import { releaseNotes } from './src/data/demo-data';
import { chatRoomWebsocketHandler } from './src/handlers/ws-chat-room';

const isViteHosted = process.env.ECOPAGES_KITCHEN_SINK_HOST === 'vite';
const isE2ERun = process.env.ECOPAGES_KITCHEN_SINK_E2E === 'true';

export const app = await createApp({
	appConfig,
	runtime: isViteHosted
		? {
				embedded: true,
			}
		: undefined,
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
