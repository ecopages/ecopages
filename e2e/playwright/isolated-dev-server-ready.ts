/**
 * Playwright `webServer` readiness — match the default runtime startup log.
 *
 * @remarks
 * Dev servers log `Bun server running at http://localhost:PORT` or
 * `Node server running at http://localhost:PORT` through `appLogger` when
 * `app.start()` runs without an `onAppStart` callback.
 *
 * Do not probe `GET /`; the port can be open earlier and an early `/` hit
 * triggers cold SSR during boot.
 */
export const ECOPAGES_SERVER_READY_STDOUT_REGEX = /(?:Bun|Node) server running at/;

export type DevServerReadySignal = { wait: { stdout: RegExp } };

export function getEcopagesServerReadySignal(): DevServerReadySignal {
	return { wait: { stdout: ECOPAGES_SERVER_READY_STDOUT_REGEX } };
}
