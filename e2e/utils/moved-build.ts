import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

/**
 * Lists every occurrence of an absolute folder in the output of a build, as `<file>: <folder>`.
 *
 * @remarks
 * Reads every file under `dist`, the server modules and the processed-asset ledger included, and checks each
 * folder with forward and with platform separators, and as JSON escapes it. A build that writes none of them can be copied to another
 * folder and started, and serves no path of the machine that built it.
 */
export function findAbsolutePathsInBuildOutput(appDir: string, folders: readonly string[]): string[] {
	const distDir = path.join(appDir, 'dist');
	const needles = [
		...new Set(
			folders.flatMap((folder) => [
				folder,
				folder.split(path.sep).join('/'),
				JSON.stringify(folder).slice(1, -1),
			]),
		),
	];
	const found: string[] = [];
	for (const entry of readdirSync(distDir, { withFileTypes: true, recursive: true })) {
		if (!entry.isFile()) continue;
		const file = path.join(entry.parentPath, entry.name);
		const text = readFileSync(file, 'utf8');
		for (const needle of needles) {
			if (text.includes(needle)) found.push(`${path.relative(appDir, file)}: ${needle}`);
		}
	}
	return found;
}

/**
 * The page routes `routes.json` lists without parameters, and the pathname of every exported `index.html`, which
 * holds the Static Path Expansions of dynamic routes.
 */
export function listServedPagePathnames(appDir: string): string[] {
	const { routes } = JSON.parse(readFileSync(path.join(appDir, 'dist', 'server', 'routes.json'), 'utf8')) as {
		routes: Array<{ pathname: string; kind: string; role: string }>;
	};
	const clientDir = path.join(appDir, 'dist', 'client');
	const exported = readdirSync(clientDir, { withFileTypes: true, recursive: true })
		.filter((entry) => entry.isFile() && entry.name === 'index.html')
		.map((entry) => `/${path.relative(clientDir, entry.parentPath).split(path.sep).join('/')}`);
	const exact = routes
		.filter((route) => route.role === 'page' && route.kind === 'exact')
		.map((route) => route.pathname);
	return [...new Set([...exact, ...exported])].sort();
}
