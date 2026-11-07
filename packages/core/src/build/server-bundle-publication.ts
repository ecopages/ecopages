import { randomUUID } from 'node:crypto';
import { path } from '@ecopages/file-system/path';
import { fileSystem } from '@ecopages/file-system';

/**
 * Creates a sibling staging directory so publication stays on one filesystem.
 *
 * @remarks
 * The directory is made with a plain `mkdir` under a unique name, not `mkdtemp`, whose 0700 mode
 * would survive the rename and leave `dist/server` unreadable to a non-root user in a deployed image.
 */
export function createServerBundleStagingDirectory(serverOutdir: string): string {
	const parentDir = path.dirname(serverOutdir);
	const stagingDir = path.join(parentDir, `.${path.basename(serverOutdir)}.staging-${randomUUID()}`);
	fileSystem.ensureDir(stagingDir);
	return stagingDir;
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
		if (hadPublishedBundle) fileSystem.rename(serverOutdir, backupDir);
		fileSystem.rename(stagingDir, serverOutdir);
	} catch (error) {
		if (hadPublishedBundle && !fileSystem.exists(serverOutdir) && fileSystem.exists(backupDir)) {
			fileSystem.rename(backupDir, serverOutdir);
		}
		throw error;
	}

	if (fileSystem.exists(backupDir)) fileSystem.remove(backupDir);
}

/** Removes an unpublished staging generation after a failed build. */
export function removeServerBundleStagingDirectory(stagingDir: string): void {
	if (fileSystem.exists(stagingDir)) fileSystem.remove(stagingDir);
}
