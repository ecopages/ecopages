import { randomUUID } from 'node:crypto';
import { mkdtempSync, renameSync } from 'node:fs';
import path from 'node:path';
import { fileSystem } from '@ecopages/file-system';

/** Creates a sibling staging directory so publication stays on one filesystem. */
export function createServerBundleStagingDirectory(serverOutdir: string): string {
	const parentDir = path.dirname(serverOutdir);
	fileSystem.ensureDir(parentDir);
	return mkdtempSync(path.join(parentDir, `.${path.basename(serverOutdir)}.staging-`));
}

/** Maps build outputs from the staging directory to their published locations. */
export function resolvePublishedServerBundlePaths(
	outputPaths: readonly string[],
	stagingDir: string,
	serverOutdir: string,
): string[] {
	return outputPaths.map((outputPath) => {
		const relativePath = path.relative(stagingDir, outputPath);
		if (!relativePath || relativePath.startsWith('..') || path.isAbsolute(relativePath)) {
			throw new Error(`Server bundle output escaped its staging directory: ${outputPath}`);
		}
		return path.join(serverOutdir, relativePath);
	});
}

/**
 * Publishes a complete server bundle generation without exposing mixed artifacts.
 *
 * @remarks
 * The previous directory is retained until the staged directory has been moved
 * into place, allowing rollback if publication fails.
 */
export function publishServerBundleDirectory(stagingDir: string, serverOutdir: string): void {
	const backupDir = path.join(path.dirname(serverOutdir), `.${path.basename(serverOutdir)}.previous-${randomUUID()}`);
	const hadPublishedBundle = fileSystem.exists(serverOutdir);

	try {
		if (hadPublishedBundle) renameSync(serverOutdir, backupDir);
		renameSync(stagingDir, serverOutdir);
	} catch (error) {
		if (hadPublishedBundle && !fileSystem.exists(serverOutdir) && fileSystem.exists(backupDir)) {
			renameSync(backupDir, serverOutdir);
		}
		throw error;
	}

	if (fileSystem.exists(backupDir)) fileSystem.remove(backupDir);
}

/** Removes an unpublished staging generation after a failed build. */
export function removeServerBundleStagingDirectory(stagingDir: string): void {
	if (fileSystem.exists(stagingDir)) fileSystem.remove(stagingDir);
}
