import path from 'node:path';
import { fileSystem } from '@ecopages/file-system';
import { appLogger } from '../global/app-logger.ts';

export type HmrEntrypointRole = 'page' | 'script';

export interface ResolvedHmrEntrypoint {
	sourcePath: string;
	outputPath: string;
	outputUrl: string;
	role: HmrEntrypointRole;
}

function resolveRegisteredEntrypoint(
	registered: ReadonlyMap<string, ResolvedHmrEntrypoint>,
	filePath: string,
): ResolvedHmrEntrypoint | undefined {
	return registered.get(path.resolve(filePath));
}

export function isRegisteredDevTransformEntrypoint(
	registered: ReadonlyMap<string, ResolvedHmrEntrypoint>,
	filePath: string,
): boolean {
	return resolveRegisteredEntrypoint(registered, filePath) !== undefined;
}

export function isRegisteredScriptEntrypoint(
	registered: ReadonlyMap<string, ResolvedHmrEntrypoint>,
	filePath: string,
): boolean {
	return resolveRegisteredEntrypoint(registered, filePath)?.role === 'script';
}

export function encodeHmrDynamicSegments(filepath: string): string {
	return filepath.replace(/\[([^\]]+)\]/g, '_$1_');
}

/**
 * @remarks
 * Runtime rebuilds must delete the previous artifact so the bundler does not
 * reuse a stale bundle when the source file changed.
 */
export function removeStaleHmrEntrypointOutput(outputPath: string, scope: string): void {
	if (!fileSystem.exists(outputPath)) {
		return;
	}

	try {
		fileSystem.remove(outputPath);
	} catch (error) {
		appLogger.warn(
			`[${scope}] Failed to remove stale entrypoint output ${outputPath}: ${error instanceof Error ? error.message : String(error)}`,
		);
	}
}
