/**
 * Playwright `webServer` readiness — one stdout marker for every runtime.
 *
 * @remarks
 * Runtimes log `[@ecopages/ready] http://localhost:PORT` when launch finishes
 * (the Express `listen` callback equivalent). Keep this regex in sync with
 * `packages/core/src/dev/server-ready-message.ts`.
 *
 * Do not probe `GET /`; the port can be open earlier and an early `/` hit
 * triggers cold SSR during boot.
 */
export const ECOPAGES_SERVER_READY_STDOUT_REGEX = /\[@ecopages\/ready\]/;

export type DevServerReadySignal = { wait: { stdout: RegExp } };

export function getEcopagesServerReadySignal(): DevServerReadySignal {
	return { wait: { stdout: ECOPAGES_SERVER_READY_STDOUT_REGEX } };
}

/** @deprecated Use {@link getEcopagesServerReadySignal}; host/port are ignored. */
export function getIsolatedDevServerReadySignal(_host: 'ecopages' | 'vite', _port: number): DevServerReadySignal {
	return getEcopagesServerReadySignal();
}

/** @deprecated Use {@link getEcopagesServerReadySignal}. */
export function getEcopagesPreviewReadySignal(): DevServerReadySignal {
	return getEcopagesServerReadySignal();
}
