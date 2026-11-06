import path from 'node:path';

import { fileSystem } from '@ecopages/file-system';

const LOCKFILE_NAMES = [
	'pnpm-lock.yaml',
	'package-lock.json',
	'npm-shrinkwrap.json',
	'yarn.lock',
	'bun.lock',
	'bun.lockb',
];

/** Files package managers rewrite inside `node_modules` when an install finishes. */
const INSTALL_MANIFEST_PATHS = [
	'node_modules/.modules.yaml',
	'node_modules/.package-lock.json',
	'node_modules/.yarn-state.yml',
	'node_modules/.yarn-integrity',
];

/**
 * Detects a package install by the size and modification time of the lockfiles and install manifests of the
 * app and of the nearest ancestor directory with a lockfile, such as a workspace root.
 *
 * @remarks
 * A missing file counts as a state of its own, so creating or deleting one is a change too. Checking costs one
 * `stat` per candidate file and reads no contents.
 */
export class DevTransformInstallStamp {
	private readonly files: readonly string[];
	private stamp: string;

	constructor(rootDir: string) {
		this.files = resolveInstallStampFiles(rootDir);
		this.stamp = this.read();
	}

	/** Whether the install changed since construction or the previous call that returned `true`. */
	changed(): boolean {
		const next = this.read();
		if (next === this.stamp) {
			return false;
		}
		this.stamp = next;
		return true;
	}

	private read(): string {
		return this.files
			.map((file) => {
				try {
					const stats = fileSystem.stat(file);
					return `${stats.mtimeMs}:${stats.size}`;
				} catch {
					return '-';
				}
			})
			.join('|');
	}
}

function resolveInstallStampFiles(rootDir: string): string[] {
	const appDir = path.resolve(rootDir);
	const directories = [appDir];
	for (let directory = appDir; ;) {
		if (LOCKFILE_NAMES.some((name) => fileSystem.exists(path.join(directory, name)))) {
			if (directory !== appDir) directories.push(directory);
			break;
		}
		const parent = path.dirname(directory);
		if (parent === directory) break;
		directory = parent;
	}
	return directories.flatMap((directory) =>
		[...LOCKFILE_NAMES, ...INSTALL_MANIFEST_PATHS].map((file) => path.join(directory, file)),
	);
}
