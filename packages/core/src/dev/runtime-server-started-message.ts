export type EcopagesRuntimeLabel = 'Bun' | 'Node';

export function formatRuntimeServerStartedMessage(runtime: EcopagesRuntimeLabel, origin: string): string {
	return `${runtime} server running at ${origin.replace(/\/$/, '')}`;
}
