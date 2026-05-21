import { lstatSync, mkdirSync, readFileSync, realpathSync, rmSync, symlinkSync, unlinkSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';

function getLoader(filePath) {
	const extension = path.extname(filePath).toLowerCase();
	if (extension === '.tsx') return 'tsx';
	if (extension === '.jsx') return 'jsx';
	if (extension === '.json') return 'json';
	return extension === '.ts' || extension === '.mts' || extension === '.cts' ? 'ts' : 'js';
}

function shouldRewriteSource(filePath, rootDir) {
	const normalizedPath = path.resolve(filePath);
	const normalizedRootDir = path.resolve(rootDir);
	return normalizedPath === normalizedRootDir || normalizedPath.startsWith(`${normalizedRootDir}${path.sep}`);
}

function rewriteImportMeta(contents, filePath, entryFile) {
	const normalizedPath = path.resolve(filePath);
	const normalizedEntryFile = path.resolve(entryFile);
	return contents
		.replaceAll('import.meta.env', 'process.env')
		.replaceAll('import.meta.main', normalizedPath === normalizedEntryFile ? 'true' : 'false')
		.replaceAll('import.meta.url', JSON.stringify(pathToFileURL(filePath).href))
		.replaceAll('import.meta.dirname', JSON.stringify(path.dirname(filePath)))
		.replaceAll('import.meta.filename', JSON.stringify(filePath))
		.replaceAll('import.meta.dir', JSON.stringify(path.dirname(filePath)))
		.replaceAll('import.meta.path', JSON.stringify(filePath));
}

function getPackageNameFromSpecifier(specifier) {
	if (specifier.startsWith('@')) {
		const [scope, name] = specifier.split('/');
		return `${scope}/${name}`;
	}

	return specifier.split('/')[0] ?? specifier;
}

function findPackageRoot(resolvedPath) {
	let currentPath = path.dirname(resolvedPath);

	while (true) {
		const packageJsonPath = path.join(currentPath, 'package.json');
		try {
			lstatSync(packageJsonPath);
			return currentPath;
		} catch {}

		const parentPath = path.dirname(currentPath);
		if (parentPath === currentPath) {
			throw new Error(`Could not find package root for resolved dependency path: ${resolvedPath}`);
		}

		currentPath = parentPath;
	}
}

function linkPointsToPackage(linkPath, packageRoot) {
	try {
		return realpathSync(linkPath) === realpathSync(packageRoot);
	} catch {
		return false;
	}
}

function removeRuntimePackageLink(linkPath) {
	try {
		const stats = lstatSync(linkPath);
		if (stats.isSymbolicLink()) {
			unlinkSync(linkPath);
			return;
		}
	} catch {
		return;
	}

	rmSync(linkPath, { recursive: true, force: true });
}

function ensureRuntimePackageLink(nodeModulesDir, specifier, resolvedPath) {
	const packageName = getPackageNameFromSpecifier(specifier);
	const packageRoot = findPackageRoot(resolvedPath);
	const linkPath = path.join(nodeModulesDir, packageName);

	mkdirSync(path.dirname(linkPath), { recursive: true });

	try {
		lstatSync(linkPath);
		if (linkPointsToPackage(linkPath, packageRoot)) {
			return;
		}

		removeRuntimePackageLink(linkPath);
	} catch {}

	symlinkSync(packageRoot, linkPath, 'dir');
}

function createNodeEntryBridgePlugin({ rootDir, entryFile, runtimeNodeModulesDir }) {
	return {
		name: 'ecopages-node-entry-bridge',
		setup(buildContext) {
			buildContext.onResolve({ filter: /^[@A-Za-z0-9][^:]*$/ }, (args) => {
				try {
					const resolvedPath = createRequire(path.join(args.resolveDir || rootDir, 'package.json')).resolve(
						args.path,
					);
					if (!args.path.startsWith('@ecopages/')) {
						ensureRuntimePackageLink(runtimeNodeModulesDir, args.path, resolvedPath);
					}

					if (resolvedPath.endsWith('.node')) {
						return {
							path: args.path,
							external: true,
						};
					}

					if (!args.path.startsWith('@ecopages/')) {
						return {
							path: args.path,
							external: true,
						};
					}
				} catch {
					return undefined;
				}

				return undefined;
			});

			buildContext.onResolve({ filter: /\.node$/ }, (args) => ({
				path: path.isAbsolute(args.path) ? args.path : path.resolve(args.resolveDir, args.path),
				external: true,
			}));

			buildContext.onLoad({ filter: /\.[cm]?[jt]sx?$/ }, (args) => {
				if (!shouldRewriteSource(args.path, rootDir)) {
					return undefined;
				}

				const contents = rewriteImportMeta(readFileSync(args.path, 'utf8'), args.path, entryFile);

				return {
					contents,
					loader: getLoader(args.path),
					resolveDir: path.dirname(args.path),
				};
			});
		},
	};
}

export async function buildNodeEntryBridge(entryFile, options = {}) {
	const rootDir = path.resolve(options.rootDir ?? process.cwd());
	const absoluteEntryFile = path.resolve(rootDir, entryFile);
	const outdir = path.resolve(rootDir, '.eco', 'node-entry');
	const outfile = path.join(outdir, 'app-entry.mjs');

	rmSync(outdir, { recursive: true, force: true });
	mkdirSync(outdir, { recursive: true });

	await build({
		absWorkingDir: rootDir,
		entryPoints: [absoluteEntryFile],
		outfile,
		bundle: true,
		format: 'esm',
		platform: 'node',
		target: 'es2022',
		sourcemap: 'linked',
		logLevel: 'silent',
		plugins: [
			createNodeEntryBridgePlugin({
				rootDir,
				entryFile: absoluteEntryFile,
				runtimeNodeModulesDir: path.join(outdir, 'node_modules'),
			}),
		],
	});

	return outfile;
}
