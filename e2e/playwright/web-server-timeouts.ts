export type PlaywrightWebServerConfig = {
	command: string;
	projects: string[];
};

/**
 * Playwright `webServer.timeout` per server entry.
 *
 * Cross-integration preview must wait for `ecopages build` + full static generation
 * inside the isolated copy before the port opens — 300s is empirical headroom.
 * Dev/HMR rows get 180s for cold SSR startup; lightweight fixtures use 120s.
 */
export function getWebServerTimeout(server: PlaywrightWebServerConfig): number {
	const isCrossIntegration = server.projects.some((project) => project.startsWith('cross-integration-'));
	const isPreviewBuild = server.command.includes('--mode preview') || server.command.includes('--preview');

	if (isCrossIntegration && isPreviewBuild) {
		return 300_000;
	}

	if (isCrossIntegration) {
		return 180_000;
	}

	if (server.command.includes('start-docs-e2e-server')) {
		return 300_000;
	}

	if (server.command.includes('--build') || server.command.includes(' run build ')) {
		return 180_000;
	}

	return 120_000;
}
