import { getProcessRuntime } from '../utils/runtime.ts';

export type EcopagesRuntimeLabel = 'Bun' | 'Node';

/**
 * Names the process that launched the server.
 *
 * @remarks
 * The HTTP host is the Node implementation on every runtime. The start log still
 * names Bun when Bun runs the process.
 */
export function resolveProcessRuntimeLabel(): EcopagesRuntimeLabel {
	return getProcessRuntime().name === 'bun' ? 'Bun' : 'Node';
}

export function formatRuntimeServerStartedMessage(runtime: EcopagesRuntimeLabel, origin: string): string {
	return `${runtime} server running at ${origin.replace(/\/$/, '')}`;
}
