import path from 'node:path';
import { readFileSync } from 'node:fs';
import type { EcoComponent } from '../public-types.ts';
import type { EcoPagesAppConfig } from '../internal-types.ts';
import type {
	AssetDefinition,
	AssetProcessingService,
	ProcessedAsset,
} from '../services/asset-processing-service/index.ts';
import { AssetFactory } from '../services/asset-processing-service/index.ts';
import { normalizeModuleDeclarations } from '../eco/module-dependencies.ts';
import { rapidhash } from '../utils/hash.ts';
import { parseSync } from 'oxc-parser';

/**
 * Parses a component's source file with oxc-parser and collects all
 * `ecopages:` virtual module imports, preserving their named specifiers.
 * Type-only imports (`import type`) are skipped since they don't exist at runtime.
 *
 * @example
 * // import { foo } from 'ecopages:images'  →  { from: 'ecopages:images', imports: ['foo'] }
 */
function extractEcopagesVirtualImports(file: string): Array<{ from: string; imports: string[] | undefined }> {
	let source: string;
	try {
		source = readFileSync(file, 'utf-8');
	} catch {
		return [];
	}

	let result;
	try {
		result = parseSync(file, source, { sourceType: 'module' });
	} catch {
		return [];
	}

	const found = new Map<string, Set<string> | null>();

	for (const node of (result.program as any).body ?? []) {
		if (node.type !== 'ImportDeclaration') continue;
		if (node.importKind === 'type') continue;
		const specifier: string = node.source?.value ?? '';
		if (!specifier.startsWith('ecopages:')) continue;

		if (found.get(specifier) === null) {
			continue;
		}

		const namedImports: string[] = [];
		for (const spec of node.specifiers ?? []) {
			if (spec.type === 'ImportSpecifier') {
				namedImports.push(spec.imported?.name ?? spec.imported?.value ?? spec.local?.name);
			}
		}

		if (namedImports.length === 0) {
			found.set(specifier, null);
			continue;
		}

		const existing = found.get(specifier);
		if (!existing) {
			found.set(specifier, new Set(namedImports));
			continue;
		}

		for (const imported of namedImports) {
			existing.add(imported);
		}
	}

	return Array.from(found.entries()).map(([from, importsSet]) => ({
		from,
		imports: importsSet ? Array.from(importsSet) : undefined,
	}));
}

function createModuleScriptName(from: string, imports: string[] | undefined): string {
	const normalizedImports = imports ? [...imports].sort().join(',') : '*';
	const hash = rapidhash(`${from}|${normalizedImports}`).toString(16);
	return `module-${hash}`;
}

function createNamedImportModuleSource(from: string, imports: string[]): string {
	const namedImports = imports.join(', ');
	return `export { ${namedImports} } from '${from}';`;
}

function createNamespaceImportModuleSource(from: string): string {
	return `export * from '${from}';`;
}

function resolveDependencyPath(componentDir: string, pathUrl: string): string {
	return path.join(componentDir, pathUrl);
}

function resolveLazyScripts(appConfig: EcoPagesAppConfig, componentDir: string, scripts: string[]): string {
	const getSafeFileName = (filepath: string): string => {
		const EXTENSIONS_TO_JS = ['ts', 'tsx'];
		const safe = filepath.replace(new RegExp(`\\.(${EXTENSIONS_TO_JS.join('|')})$`), '.js');
		return safe.startsWith('./') ? safe.slice(2) : safe;
	};

	const baseDir = componentDir.split(appConfig.srcDir)[1] ?? '';
	const resolvedPaths = scripts.map((script) => {
		const relativePath = [AssetFactory.RESOLVED_ASSETS_DIR, baseDir, getSafeFileName(script)]
			.filter(Boolean)
			.join('/')
			.replace(/\/+/g, '/');

		return `/${relativePath.replace(/^\/+/, '')}`;
	});

	return resolvedPaths.join(',');
}

export class DependencyResolverService {
	constructor(
		private appConfig: EcoPagesAppConfig,
		private assetProcessingService: AssetProcessingService,
	) {}

	resolveDependencyPath(componentDir: string, pathUrl: string): string {
		return resolveDependencyPath(componentDir, pathUrl);
	}

	/**
	 * Maps lazy script source entries to deterministic fallback public URLs
	 * used when bundling output URLs are unavailable.
	 */
	resolveLazyScripts(componentDir: string, scripts: string[]): string {
		return resolveLazyScripts(this.appConfig, componentDir, scripts);
	}

	/**
	 * Collects and processes component dependencies (styles, scripts, modules, lazy scripts).
	 * Adds the scripts injector only when at least one lazy script exists,
	 * and backfills `_resolvedScripts` from processed output URLs (or fallback URLs).
	 */
	async processComponentDependencies(
		components: (EcoComponent | Partial<EcoComponent>)[],
		integrationName: string,
	): Promise<ProcessedAsset[]> {
		if (!this.assetProcessingService?.processDependencies) return [];
		const dependencies: AssetDefinition[] = [];
		const lazyScriptsByConfig = new Map<
			NonNullable<EcoComponent['config']>,
			{ sourcePath: string; fallbackUrl: string }[]
		>();

		for (const component of components) {
			const componentFile = component.config?.__eco?.file;
			if (!componentFile) continue;

			const stylesheetsSet = new Set<string>();
			const scriptsSet = new Set<string>();
			const modulesMap = new Map<string, Set<string> | null>();

			const collect = (config: EcoComponent['config']) => {
				if (!config) return;

				const file = config.__eco?.file;
				if (!file) return;
				const dir = path.dirname(file);
				const dependenciesConfig = config.dependencies;

				if (dependenciesConfig?.stylesheets) {
					for (const style of dependenciesConfig.stylesheets) {
						stylesheetsSet.add(resolveDependencyPath(dir, style));
					}
				}

				if (dependenciesConfig?.scripts) {
					for (const script of dependenciesConfig.scripts) {
						scriptsSet.add(resolveDependencyPath(dir, script));
					}
				}

				const normalizedModules = normalizeModuleDeclarations(dependenciesConfig?.modules);

				for (const declaration of normalizedModules) {
					const existing = modulesMap.get(declaration.from);
					if (!declaration.imports || declaration.imports.length === 0) {
						modulesMap.set(declaration.from, null);
						continue;
					}

					if (existing === null) {
						continue;
					}

					const merged = existing ?? new Set<string>();
					for (const imported of declaration.imports) {
						merged.add(imported);
					}
					modulesMap.set(declaration.from, merged);
				}

				if (dependenciesConfig?.lazy?.scripts) {
					const lazyScriptFallbacks = this.resolveLazyScripts(dir, dependenciesConfig.lazy.scripts).split(
						',',
					);
					const lazyScripts = dependenciesConfig.lazy.scripts.map((script, index) => ({
						sourcePath: this.resolveDependencyPath(dir, script),
						fallbackUrl: lazyScriptFallbacks[index] ?? '',
					}));

					const existingLazyScripts = lazyScriptsByConfig.get(config) ?? [];
					existingLazyScripts.push(...lazyScripts);
					lazyScriptsByConfig.set(config, existingLazyScripts);

					for (const script of dependenciesConfig.lazy.scripts) {
						const resolvedPath = this.resolveDependencyPath(dir, script);
						dependencies.push(
							AssetFactory.createFileScript({
								filepath: resolvedPath,
								position: 'head',
								excludeFromHtml: true,
								attributes: {
									type: 'module',
									defer: '',
								},
							}),
						);
					}
				}

				if (dependenciesConfig?.components) {
					for (const nestedComponent of dependenciesConfig.components) {
						if (nestedComponent.config) {
							collect(nestedComponent.config);
						}
					}
				}

				// Auto-detect `ecopages:` virtual module imports from the component source file
				const autoVirtualImports = extractEcopagesVirtualImports(file);
				for (const { from, imports } of autoVirtualImports) {
					const existing = modulesMap.get(from);
					if (!imports || imports.length === 0) {
						if (existing !== null) modulesMap.set(from, null);
						continue;
					}
					if (existing === null) continue;
					const merged = existing ?? new Set<string>();
					for (const imported of imports) merged.add(imported);
					modulesMap.set(from, merged);
				}
			};

			collect(component.config);

			dependencies.push(
				...Array.from(stylesheetsSet).map((stylesheet) =>
					AssetFactory.createFileStylesheet({
						filepath: stylesheet,
						position: 'head',
						attributes: { rel: 'stylesheet' },
					}),
				),
				...Array.from(scriptsSet).map((script) =>
					AssetFactory.createFileScript({
						filepath: script,
						position: 'head',
						attributes: {
							type: 'module',
							defer: '',
						},
					}),
				),
				...Array.from(modulesMap.entries()).map(([from, importsSet]) => {
					const imports = importsSet ? Array.from(importsSet) : undefined;
					return AssetFactory.createContentScript({
						position: 'head',
						name: createModuleScriptName(from, imports),
						content:
							imports && imports.length > 0
								? createNamedImportModuleSource(from, imports)
								: createNamespaceImportModuleSource(from),
						attributes: {
							type: 'module',
							defer: '',
						},
					});
				}),
			);
		}

		const hasLazyDependencies = dependencies.some((dep) => dep.kind === 'script' && dep.excludeFromHtml === true);

		if (hasLazyDependencies) {
			dependencies.unshift(
				AssetFactory.createNodeModuleScript({
					position: 'head',
					importPath: '@ecopages/scripts-injector',
					name: 'scripts-injector',
					attributes: {
						type: 'module',
						defer: '',
					},
				}),
			);
		}

		const processedDependencies = await this.assetProcessingService.processDependencies(
			dependencies,
			integrationName,
		);
		const lazySourceToOutputUrl = new Map<string, string>();

		for (const dependency of processedDependencies) {
			if (dependency.kind === 'script' && dependency.srcUrl && dependency.filepath) {
				lazySourceToOutputUrl.set(path.normalize(dependency.filepath), dependency.srcUrl);
			}
		}

		for (const [config, lazyScripts] of lazyScriptsByConfig.entries()) {
			const resolvedUrls = lazyScripts
				.map(
					({ sourcePath, fallbackUrl }) =>
						lazySourceToOutputUrl.get(path.normalize(sourcePath)) ?? fallbackUrl,
				)
				.filter((url) => url.length > 0);

			if (resolvedUrls.length > 0) {
				config._resolvedScripts = Array.from(new Set(resolvedUrls)).join(',');
			}
		}

		return processedDependencies;
	}
}
