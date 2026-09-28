import { availableParallelism } from 'node:os';

/**
 * Default in-project Playwright worker count for fixture and cross-integration preview
 * projects. Cross-integration dev/HMR rows override this to `1` because they share an
 * SSR server or mutate files on disk.
 */
export function getDefaultWorkerCount(): number {
	const maxAvailableWorkers = availableParallelism();
	return maxAvailableWorkers > 1 ? maxAvailableWorkers : 1;
}
