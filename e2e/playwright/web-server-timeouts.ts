export type PlaywrightWebServerConfig = {
	command: string;
	projects: string[];
};

/**
 * Playwright `webServer.timeout` per server entry.
 *
 * Kitchen-sink preview must wait for `ecopages build` + full static generation
 * inside the isolated copy before the port opens — 300s is empirical headroom.
 * Dev/HMR rows get 180s for cold SSR startup; lightweight fixtures use 120s.
 */
export function getWebServerTimeout(server: PlaywrightWebServerConfig): number {
	const isKitchenSink = server.projects.some((project) => project.startsWith('kitchen-sink-'));
	const isPreviewBuild = server.command.includes('--mode preview') || server.command.includes('--preview');

	if (isKitchenSink && isPreviewBuild) {
		return 300_000;
	}

	if (isKitchenSink) {
		return 180_000;
	}

	if (server.command.includes(' run build ')) {
		return 180_000;
	}

	return 120_000;
}
