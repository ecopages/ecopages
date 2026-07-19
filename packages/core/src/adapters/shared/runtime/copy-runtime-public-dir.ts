import { readdirSync } from 'node:fs';
import path from 'node:path';
import { fileSystem } from '@ecopages/file-system';

/**
 * Copies a source public directory into the runtime dist dir, skipping unchanged files.
 *
 * Dev restarts call this on every boot; byte comparison avoids rewriting identical assets.
 */
export function copyRuntimePublicDirIfChanged(sourceDir: string, destinationDir: string): void {
	fileSystem.ensureDir(destinationDir);

	for (const entry of readdirSync(sourceDir, { withFileTypes: true })) {
		const sourcePath = path.join(sourceDir, entry.name);
		const destinationPath = path.join(destinationDir, entry.name);

		if (entry.isDirectory()) {
			copyRuntimePublicDirIfChanged(sourcePath, destinationPath);
			continue;
		}

		if (!entry.isFile()) {
			continue;
		}

		if (
			fileSystem.exists(destinationPath) &&
			Buffer.compare(fileSystem.readFileAsBuffer(sourcePath), fileSystem.readFileAsBuffer(destinationPath)) === 0
		) {
			continue;
		}

		fileSystem.copyFile(sourcePath, destinationPath);
	}
}
