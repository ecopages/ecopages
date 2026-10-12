import { lstatSync, readdirSync, readlinkSync } from 'node:fs';
import path from 'node:path';
import { fileSystem } from '@ecopages/file-system';

function tryLstat(filePath: string) {
	try {
		return lstatSync(filePath);
	} catch (error) {
		if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
			return undefined;
		}
		throw error;
	}
}

export function copyRuntimePublicFileIfChanged(sourcePath: string, destinationPath: string): void {
	if (!fileSystem.exists(sourcePath)) {
		return;
	}

	fileSystem.ensureDir(path.dirname(destinationPath));
	const destinationIsSymbolicLink = tryLstat(destinationPath)?.isSymbolicLink() ?? false;
	if (destinationIsSymbolicLink) {
		fileSystem.remove(destinationPath);
	}
	if (
		!destinationIsSymbolicLink &&
		fileSystem.exists(destinationPath) &&
		Buffer.compare(fileSystem.readFileAsBuffer(sourcePath), fileSystem.readFileAsBuffer(destinationPath)) === 0
	) {
		return;
	}

	fileSystem.copyFile(sourcePath, destinationPath);
}

export async function copyRuntimePublicFile(sourcePath: string, destinationPath: string): Promise<void> {
	if (!(await fileSystem.existsAsync(sourcePath))) {
		return;
	}

	await fileSystem.ensureDirAsync(path.dirname(destinationPath));
	await fileSystem.copyFileAsync(sourcePath, destinationPath);
}

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

		if (entry.isSymbolicLink()) {
			const sourceTarget = readlinkSync(sourcePath);
			const destinationStats = tryLstat(destinationPath);
			const destinationExists = destinationStats !== undefined;
			const destinationTarget = destinationStats?.isSymbolicLink() ? readlinkSync(destinationPath) : undefined;
			if (sourceTarget === destinationTarget) {
				continue;
			}
			if (destinationExists) {
				fileSystem.remove(destinationPath);
			}
			fileSystem.copyFile(sourcePath, destinationPath);
			continue;
		}

		if (!entry.isFile()) {
			continue;
		}

		copyRuntimePublicFileIfChanged(sourcePath, destinationPath);
	}
}
