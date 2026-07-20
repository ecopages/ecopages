import fs from 'node:fs';
import path from 'node:path';
import { fileSystem } from '@ecopages/file-system';
import { RESOLVED_ASSETS_DIR } from '../config/constants.ts';
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
 * Resolves the on-disk and browser URL targets for one HMR script entrypoint.
 */
export function resolveHmrEntrypointOutputPaths(
	srcDir: string,
	distDir: string,
	entrypointPath: string,
): { outputPath: string; outputUrl: string } {
	const normalizedEntrypoint = path.resolve(entrypointPath);
	const relativePath = path.relative(srcDir, normalizedEntrypoint);
	const relativePathJs = relativePath.replace(/\.(tsx?|jsx?|mdx?)$/, '.js');
	const encodedPathJs = encodeHmrDynamicSegments(relativePathJs);
	const urlPath = encodedPathJs.split(path.sep).join('/');

	return {
		outputUrl: `/${path.join(RESOLVED_ASSETS_DIR, '_hmr', urlPath).split(path.sep).join('/')}`,
		outputPath: path.join(distDir, urlPath),
	};
}

/**
 * @remarks
 * Rebuilds must delete the previous artifact so browser-hmr does not reuse a
 * stale bundle when the source file changed.
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

/**
 * @remarks
 * Guards against broadcasting reload/update before the bundler has flushed a
 * fresher artifact than the edited source file.
 */
export function isHmrOutputFresh(outputPath: string, sourcePath: string): boolean {
	if (!fileSystem.exists(outputPath) || !fileSystem.exists(sourcePath)) {
		return false;
	}

	const outputMtimeMs = fs.statSync(outputPath).mtimeMs;
	const sourceMtimeMs = fs.statSync(sourcePath).mtimeMs;

	return outputMtimeMs >= sourceMtimeMs;
}

/**
 * @remarks
 * Missing output is treated as a benign rebuild race. This helper isolates the
 * post-build case where a bundle exists but is still older than its source.
 */
export function isHmrOutputOlderThanSource(outputPath: string, sourcePath: string): boolean {
	if (!fileSystem.exists(outputPath) || !fileSystem.exists(sourcePath)) {
		return false;
	}

	return fs.statSync(outputPath).mtimeMs < fs.statSync(sourcePath).mtimeMs;
}
