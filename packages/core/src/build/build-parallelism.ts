import { availableParallelism } from 'node:os';

/**
 * @remarks Build work leaves one logical CPU available to the app and always uses at least one worker.
 */
export function resolveBuildParallelism(availableCores = availableParallelism()): number {
	return Math.max(1, availableCores - 1);
}
