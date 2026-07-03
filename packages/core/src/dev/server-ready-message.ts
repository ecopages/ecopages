/**
 * Optional helpers for apps that want a machine-readable "ready" log line
 * (for example Playwright `webServer` stdout matching). Pass to `app.start(onAppStart)`.
 */
export const ECOPAGES_SERVER_READY_MARKER = '[@ecopages/ready]';

export function formatServerReadyMessage(origin: string): string {
	return `${ECOPAGES_SERVER_READY_MARKER} ${origin.replace(/\/$/, '')}`;
}
