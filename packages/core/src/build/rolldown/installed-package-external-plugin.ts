import { builtinModules } from 'node:module';
import path from 'node:path';
import { fileSystem } from '@ecopages/file-system';
import { fileURLToPath } from 'node:url';
import { appLogger } from '../../global/app-logger.ts';
import { isPathInside } from '../../utils/path-containment.ts';
import { isBarePackageImportSpecifier } from '../../plugins/tsconfig-import-resolver.ts';
import { toPackageRootSpecifier } from '../../plugins/package-specifier.ts';
import { realpathOfDirectory } from '../preserve-import-meta-transform.ts';
import { isDeclaredAppPackageImport } from './app-package-declarations.ts';
import { normalizeRolldownModuleId, rewriteInstalledPackageSpecifiers } from './installed-package-import-rewriter.ts';
import type { InstalledPackageExternalBinding } from './installed-package-import-rewriter.ts';
import type { RolldownPlugin } from 'rolldown';

const coreSourceFile = fileURLToPath(import.meta.url);
const nodeBuiltinSpecifiers = new Set(builtinModules);
const CORE_RUNTIME_BUNDLED_PACKAGES = new Set<string>(['ws']);
const DEPLOY_LAYOUT_DOCS_URL = 'https://ecopages.app/docs/reference/deployment';
const MAX_WARNED_PACKAGE_NAMES = 5;

let corePackageNames: Set<string> | undefined;

function getCorePackageNames(): Set<string> {
	if (corePackageNames) return corePackageNames;
	const packageJsonPath = fileURLToPath(new URL('../../../package.json', import.meta.url));
	corePackageNames = new Set<string>();
	try {
		const packageJson = JSON.parse(fileSystem.readFileSync(packageJsonPath)) as Record<string, unknown>;
		for (const field of ['dependencies', 'devDependencies', 'peerDependencies', 'optionalDependencies'] as const) {
			const entries = packageJson[field];
			if (!entries || typeof entries !== 'object') continue;
			for (const name of Object.keys(entries as Record<string, unknown>)) corePackageNames.add(name);
		}
	} catch {
		return corePackageNames;
	}
	return corePackageNames;
}

function isPackageImport(id: string, contextRoot: string): boolean {
	return isBarePackageImportSpecifier(id, contextRoot);
}

function isNodeBuiltinSpecifier(id: string): boolean {
	return id.startsWith('node:') || nodeBuiltinSpecifiers.has(id);
}

function isUndeclaredPackageImport(id: string, contextRoot: string): boolean {
	return (
		!isNodeBuiltinSpecifier(id) &&
		!CORE_RUNTIME_BUNDLED_PACKAGES.has(toPackageRootSpecifier(id)) &&
		isPackageImport(id, contextRoot) &&
		!isDeclaredAppPackageImport(id, contextRoot)
	);
}

/**
 * @remarks
 * A store whose real path has no `node_modules` segment is not recognised, so
 * its packages are bundled. Yarn Plug'n'Play archives (`.zip` paths) are
 * bundled too: Node cannot import a path into an archive without the PnP
 * loader, so PnP installs are not supported for relocated server output.
 */
function isInstalledCompiledModule(filePath: string): boolean {
	return /\.[cm]?js$/u.test(filePath) && /[\\/]node_modules[\\/]/u.test(filePath) && !/\.zip[\\/]/u.test(filePath);
}

function warnPackagesOutsideAppRoot(outputLabel: string, packageNames: Iterable<string>): void {
	const sorted = [...packageNames].sort();
	if (sorted.length === 0) return;
	const hidden = sorted.length - MAX_WARNED_PACKAGE_NAMES;
	const names = sorted.slice(0, MAX_WARNED_PACKAGE_NAMES).join(', ');
	const count = sorted.length === 1 ? '1 package' : `${sorted.length} packages`;
	appLogger.warn(
		`${outputLabel} imports ${count} from outside the app folder (${hidden > 0 ? `${names} and ${hidden} more` : names}); copy them with the app or build from a standalone install: ${DEPLOY_LAYOUT_DOCS_URL}`,
	);
}

/**
 * Keeps installed compiled packages external as paths relative to the output
 * directory.
 *
 * @remarks
 * A compiled package can depend on its location on disk: it loads a native
 * binding (`sharp`, `oxc-parser`), a platform package, or a sibling file
 * through `createRequire(import.meta.url)` or `__dirname`. Bundled into
 * `dist/.server/`, that lookup starts from the wrong folder and fails at
 * runtime, and the bundle cannot tell which packages do it. So server builds
 * bundle source code only (the app, workspace packages, TypeScript or JSX
 * packages) and keep every compiled package installed in `node_modules`
 * external, including the dependencies of bundled workspace packages and of
 * Core itself.
 *
 * Under isolated installs (pnpm, Bun's isolated linker) a package the app does
 * not declare is not reachable as a bare specifier from `dist/.server`, so the
 * hook resolves it through Rolldown, from the importer (or, for Core's own
 * dependencies, from Core), so the `node` and `import` conditions apply and
 * the result is a real path, and returns a `./` or `../` path that Rolldown
 * writes unchanged. The output keeps working when `dist` and `node_modules`
 * move together, for example into a container image.
 *
 * The path is computed here rather than with `external: 'relative'`, because
 * Rolldown 1.2 computes that path from `cwd` instead of the output directory.
 * It is computed relative to `outdir` and adjusted after chunk names are
 * known, so preserved-module output can keep its source-derived subdirectories.
 * With `reportDir` (the directory the output runs from) it also reports the
 * packages that resolve outside the app folder, naming the entry files by
 * their path in that directory.
 *
 * Packages the app declares stay bare specifiers through the `external`
 * option, which Rolldown checks before this hook. Packages in
 * `CORE_RUNTIME_BUNDLED_PACKAGES`, workspace and source packages, anything
 * that does not resolve and anything on another drive than `outdir` are
 * bundled.
 */
export function createInstalledPackageExternalPlugin(
	contextRoot: string,
	outdir: string,
	reportDir?: string,
): RolldownPlugin {
	const coreNames = getCorePackageNames();
	const externalBindings: InstalledPackageExternalBinding[] = [];
	const rewrittenImportsByChunk = new Map<string, Map<string, string>>();
	const outsideRootPackages = new Set<string>();
	let realOutdir: string | undefined;
	let realContextRoot: string | undefined;
	return {
		name: 'ecopages-installed-package-external',
		resolveId: {
			filter: { id: /^[^./\\\0]/u },
			async handler(id, importer, extraOptions) {
				if (!isUndeclaredPackageImport(id, contextRoot)) return null;
				const packageName = toPackageRootSpecifier(id);
				const resolveOptions = { kind: extraOptions.kind, skipSelf: true };
				const resolved =
					(importer ? await this.resolve(id, importer, resolveOptions) : null) ??
					(coreNames.has(packageName) ? await this.resolve(id, coreSourceFile, resolveOptions) : null);
				if (!resolved || resolved.external || !isInstalledCompiledModule(resolved.id)) return null;
				realOutdir ??= realpathOfDirectory(outdir);
				const externalReference = createInstalledPackageExternalReference(
					importer,
					resolved.id,
					realOutdir,
					extraOptions.kind,
				);
				if (!externalReference) return null;
				realContextRoot ??= realpathOfDirectory(contextRoot);
				if (reportDir && !isPathInside(resolved.id, realContextRoot)) outsideRootPackages.add(packageName);
				if (externalReference.binding) externalBindings.push(externalReference.binding);
				return { id: externalReference.id, external: true };
			},
		},
		renderChunk(code, chunk, outputOptions) {
			const moduleIds = new Set(chunk.moduleIds.map(normalizeRolldownModuleId));
			const emittedImports = new Map<string, string>();
			const emittedPath = path.resolve(realOutdir ?? outdir, chunk.fileName);
			for (const binding of externalBindings) {
				if (!moduleIds.has(binding.importer)) continue;
				if (!chunk.imports.includes(binding.externalId) && !chunk.dynamicImports.includes(binding.externalId))
					continue;
				const relativePath = path.relative(path.dirname(emittedPath), binding.target).split(path.sep).join('/');
				const emittedImport = relativePath.startsWith('../') ? relativePath : `./${relativePath}`;
				const existing = emittedImports.get(binding.externalId);
				if (existing && existing !== emittedImport) {
					this.error(
						`[installed-package-external] "${chunk.fileName}" resolves "${binding.externalId}" to more than one installed package path.`,
					);
				}
				emittedImports.set(binding.externalId, emittedImport);
				const resolvedImport = path.resolve(path.dirname(emittedPath), emittedImport);
				if (resolvedImport !== binding.target) {
					this.error(
						`[installed-package-external] "${chunk.fileName}" imports "${emittedImport}", which does not resolve to the installed package from that emitted module.`,
					);
				}
			}

			if (emittedImports.size === 0) return null;
			const externalRequireIds = new Set(
				externalBindings
					.filter((binding) => moduleIds.has(binding.importer) && binding.kind === 'require-call')
					.map((binding) => binding.externalId),
			);
			const rewritten = rewriteInstalledPackageSpecifiers(
				code,
				chunk.fileName,
				emittedImports,
				externalRequireIds,
				outputOptions.format === 'cjs',
			);
			if (!rewritten) return null;
			rewrittenImportsByChunk.set(chunk.fileName, emittedImports);
			return rewritten;
		},
		generateBundle(_outputOptions, bundle) {
			const entryFileNames: string[] = [];
			for (const output of Object.values(bundle)) {
				if (output.type !== 'chunk') continue;
				if (output.isEntry) entryFileNames.push(output.fileName);
				const rewrittenImports =
					rewrittenImportsByChunk.get(output.preliminaryFileName) ??
					rewrittenImportsByChunk.get(output.fileName);
				if (rewrittenImports) {
					output.imports = output.imports.map((specifier) => rewrittenImports.get(specifier) ?? specifier);
					output.dynamicImports = output.dynamicImports.map(
						(specifier) => rewrittenImports.get(specifier) ?? specifier,
					);
				}
			}
			if (!reportDir) return;
			const outputLabel = entryFileNames
				.map((fileName) => path.relative(contextRoot, path.join(reportDir, fileName)).split(path.sep).join('/'))
				.join(', ');
			warnPackagesOutsideAppRoot(outputLabel, outsideRootPackages);
		},
	};
}

function createInstalledPackageExternalReference(
	importer: string | undefined,
	target: string,
	outdir: string,
	kind?: string,
): { id: string; binding?: InstalledPackageExternalBinding } | null {
	const relativePath = path.relative(outdir, target).split(path.sep).join('/');
	if (path.isAbsolute(relativePath)) return null;
	const id = relativePath.startsWith('../') ? relativePath : `./${relativePath}`;
	if (!importer) return { id };
	return {
		id,
		binding: {
			importer: normalizeRolldownModuleId(importer),
			externalId: id,
			target: path.resolve(target),
			kind,
		},
	};
}
