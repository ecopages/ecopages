import { resolveRequestPipelineRuntime } from '../diagnostics/request-pipeline-metrics.ts';

export type EcopagesRuntimeLabel = 'Bun' | 'Node';

/**
 * Names the process that launched the server.
 *
 * @remarks
 * The HTTP host is the Node implementation on every runtime. The start log still
 * names Bun when the process is Bun.
 */
export function resolveProcessRuntimeLabel(): EcopagesRuntimeLabel {
	return resolveRequestPipelineRuntime() === 'bun' ? 'Bun' : 'Node';
}

export function formatRuntimeServerStartedMessage(runtime: EcopagesRuntimeLabel, origin: string): string {
	return `${runtime} server running at ${origin.replace(/\/$/, '')}`;
}
