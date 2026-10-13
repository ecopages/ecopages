import { availableParallelism } from 'node:os';

/** Default Playwright worker count: one per available core. */
export function getDefaultWorkerCount(): number {
	const maxAvailableWorkers = availableParallelism();
	return maxAvailableWorkers > 1 ? maxAvailableWorkers : 1;
}
