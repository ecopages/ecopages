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
		this.registered.delete(path.resolve(entrypointPath));
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
