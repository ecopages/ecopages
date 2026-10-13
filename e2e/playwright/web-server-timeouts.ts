export type PlaywrightWebServerConfig = {
	command: string;
	projects: string[];
};

/**
 * Playwright `webServer.timeout` per server entry.
 *
 * Cross-integration dev, HMR and preview servers get 180s for cold SSR startup (the preview servers
 * only serve a build made before Playwright). Fixture static projects run `ecopages preview`, which
 * builds the static export before the port opens, so they get 180s too. The docs server builds on
 * demand and gets 300s. Other servers use 120s.
 */
export function getWebServerTimeout(server: PlaywrightWebServerConfig): number {
	if (server.projects.some((project) => project.startsWith('cross-integration-'))) {
		return 180_000;
	}

	if (server.command.includes('start-docs-e2e-server')) {
		return 300_000;
	}

	if (server.command.includes(' preview --runtime node')) {
		return 180_000;
	}

	return 120_000;
}
