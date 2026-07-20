import path from 'node:path';
import type { ResolvedHmrEntrypoint } from '../../../hmr/hmr-entrypoint-output.ts';

/**
 * Tracks dev-transform entrypoints registered for HMR invalidation.
 */
export class DevTransformEntrypointRegistry {
	private readonly registered = new Map<string, ResolvedHmrEntrypoint>();

	getRegisteredEntrypoints(): ReadonlyMap<string, ResolvedHmrEntrypoint> {
		return this.registered;
	}

	getWatchedOutputUrls(): Map<string, string> {
		const watchedFiles = new Map<string, string>();
		for (const [sourcePath, entrypoint] of this.registered) {
			watchedFiles.set(sourcePath, entrypoint.outputUrl);
		}
		return watchedFiles;
	}

	clearRegistration(entrypointPath: string): void {
		const normalizedEntrypoint = path.resolve(entrypointPath);
		this.registered.delete(normalizedEntrypoint);
		this.inFlight.delete(normalizedEntrypoint);
	}

	isEntrypointInFlight(entrypointPath: string): boolean {
		return this.inFlight.has(path.resolve(entrypointPath));
	}

	/**
	 * Registers an in-flight promise so concurrent {@link registerEntrypoint}
	 * callers coalesce on the same cold client-graph build.
	 */
	trackInFlightEntrypoint(entrypointPath: string, promise: Promise<ResolvedHmrEntrypoint>): void {
		this.tryTrackInFlightEntrypoint(entrypointPath, promise);
	}

	/**
	 * Reserves the in-flight slot when it is still free.
	 *
	 * @returns `false` when another registration (for example on-demand SSR) already owns the slot.
	 */
	tryTrackInFlightEntrypoint(entrypointPath: string, promise: Promise<ResolvedHmrEntrypoint>): boolean {
		const normalizedEntrypoint = path.resolve(entrypointPath);
		if (this.inFlight.has(normalizedEntrypoint)) {
			return false;
		}

		this.inFlight.set(normalizedEntrypoint, promise);
		return true;
	}

	releaseInFlightEntrypoint(entrypointPath: string): void {
		const normalizedEntrypoint = path.resolve(entrypointPath);
		if (this.inFlight.get(normalizedEntrypoint)) {
			this.inFlight.delete(normalizedEntrypoint);
		}
	}

	registerTransformModule(
		sourcePath: string,
		outputUrl: string,
		options: { role: 'page' } | { role: 'script' },
	): void {
		const normalized = path.resolve(sourcePath);
		this.registered.set(normalized, {
			sourcePath: normalized,
			outputPath: normalized,
			outputUrl,
			role: options.role,
		});
	}

	clearAll(): void {
		this.registered.clear();
	}
}
