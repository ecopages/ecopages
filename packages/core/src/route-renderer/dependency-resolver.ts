import path from 'node:path';
import { readFileSync } from 'node:fs';
import type {
	DependencyLazyTrigger,
	EcoComponent,
	EcoComponentDependencyEntry,
	ResolvedLazyScriptGroup,
} from '../public-types.ts';
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

function isDependencyEntryObject(entry: string | EcoComponentDependencyEntry): entry is EcoComponentDependencyEntry {
	return typeof entry === 'object' && entry !== null;
}

function getDependencyEntrySrc(entry: string | EcoComponentDependencyEntry): string | undefined {
	return isDependencyEntryObject(entry) ? entry.src : entry;
}

/**
 * Reads inline dependency content from an entry object.
 * Returns `undefined` for string entries.
 */
function getDependencyEntryContent(entry: string | EcoComponentDependencyEntry): string | undefined {
	return isDependencyEntryObject(entry) ? entry.content : undefined;
}

/**
 * Reads optional HTML tag attributes from an entry object.
 * Returns `undefined` for string entries.
 */
function getDependencyEntryAttributes(entry: string | EcoComponentDependencyEntry): Record<string, string> | undefined {
	return isDependencyEntryObject(entry) ? entry.attributes : undefined;
}

/**
 * Resolves the `src` field from a dependency entry and throws when absent.
 *
 * Used for entry forms where a file-backed source is mandatory
 * (for example certain lazy script code paths).
 */
function getDependencyEntrySrcOrThrow(entry: string | EcoComponentDependencyEntry, context: string): string {
	const src = getDependencyEntrySrc(entry);
	if (!src) {
		throw new Error(`${context} requires a src value`);
	}

	return src;
}

/**
 * Creates a stable grouping key for a lazy trigger.
 *
 * This key is used to bucket lazy scripts that share the same trigger so
 * each group can be emitted into its own scripts-injector wrapper.
 */
function getLazyTriggerKey(lazy: DependencyLazyTrigger): string {
	if ('on:idle' in lazy) {
		return 'on:idle';
	}

	if ('on:interaction' in lazy) {
		return `on:interaction:${lazy['on:interaction']}`;
	}

	if ('on:visible' in lazy) {
		const value = lazy['on:visible'];
		return `on:visible:${value === true ? 'true' : value}`;
	}

	return JSON.stringify(lazy);
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
	 * and backfills `_resolvedLazyScripts` from processed output URLs (or fallback URLs).
	 */
	async processComponentDependencies(
		components: (EcoComponent | Partial<EcoComponent>)[],
		integrationName: string,
	): Promise<ProcessedAsset[]> {
		if (!this.assetProcessingService?.processDependencies) return [];
		const dependencies: AssetDefinition[] = [];
		type LazyScriptRef = {
			lazyKey: string;
			fallbackUrl?: string;
		};
		type LazyGroup = {
			lazy: DependencyLazyTrigger;
			scripts: LazyScriptRef[];
		};
		const lazyScriptsByConfig = new Map<NonNullable<EcoComponent['config']>, Map<string, LazyGroup>>();
		const lazyDependencyKeys = new Set<string>();

		for (const component of components) {
			const componentFile = component.config?.__eco?.file;
			if (!componentFile) continue;

			const stylesheetDependencyKeys = new Set<string>();
			const scriptDependencyKeys = new Set<string>();
			const modulesMap = new Map<string, Set<string> | null>();

			const collect = (config: EcoComponent['config']) => {
				if (!config) return;

				const file = config.__eco?.file;
				if (!file) return;
				const dir = path.dirname(file);
				const dependenciesConfig = config.dependencies;

				const registerLazyScript = ({
					lazy,
					lazyKey,
					fallbackUrl,
				}: {
					lazy: DependencyLazyTrigger;
					lazyKey: string;
					fallbackUrl?: string;
				}) => {
					let grouped = lazyScriptsByConfig.get(config);
					if (!grouped) {
						grouped = new Map<string, LazyGroup>();
						lazyScriptsByConfig.set(config, grouped);
					}

					const triggerKey = getLazyTriggerKey(lazy);
					const existing = grouped.get(triggerKey) ?? { lazy, scripts: [] };
					existing.scripts.push({ lazyKey, fallbackUrl });
					grouped.set(triggerKey, existing);
				};

				if (dependenciesConfig?.stylesheets) {
					for (const style of dependenciesConfig.stylesheets) {
						const content = getDependencyEntryContent(style);
						const src = getDependencyEntrySrc(style);
						const attributes = getDependencyEntryAttributes(style);

						if (content) {
							const depKey = `style:content:${content}:${JSON.stringify(attributes ?? {})}`;
							if (stylesheetDependencyKeys.has(depKey)) {
								continue;
							}

							stylesheetDependencyKeys.add(depKey);
							dependencies.push(
								AssetFactory.createContentStylesheet({
									content,
									position: 'head',
									attributes,
								}),
							);
							continue;
						}

						if (!src) {
							throw new Error('Invalid stylesheet dependency entry: expected src or content');
						}

						const resolvedPath = resolveDependencyPath(dir, src);
						const depKey = `style:file:${resolvedPath}:${JSON.stringify(attributes ?? {})}`;
						if (stylesheetDependencyKeys.has(depKey)) {
							continue;
						}

						stylesheetDependencyKeys.add(depKey);
						dependencies.push(
							AssetFactory.createFileStylesheet({
								filepath: resolvedPath,
								position: 'head',
								attributes: {
									rel: 'stylesheet',
									...attributes,
								},
							}),
						);
					}
				}

				if (dependenciesConfig?.scripts) {
					for (const script of dependenciesConfig.scripts) {
						if (isDependencyEntryObject(script) && script.lazy) {
							continue;
						}

						const content = getDependencyEntryContent(script);
						const src = getDependencyEntrySrc(script);
						const attributes = getDependencyEntryAttributes(script);

						if (content) {
							const depKey = `script:content:${content}:${JSON.stringify(attributes ?? {})}`;
							if (scriptDependencyKeys.has(depKey)) {
								continue;
							}

							scriptDependencyKeys.add(depKey);
							dependencies.push(
								AssetFactory.createContentScript({
									position: 'head',
									content,
									attributes: {
										type: 'module',
										defer: '',
										...attributes,
									},
								}),
							);
							continue;
						}

						if (!src) {
							throw new Error('Invalid script dependency entry: expected src or content');
						}

						const resolvedPath = resolveDependencyPath(dir, src);
						const depKey = `script:file:${resolvedPath}:${JSON.stringify(attributes ?? {})}`;
						if (scriptDependencyKeys.has(depKey)) {
							continue;
						}

						scriptDependencyKeys.add(depKey);
						dependencies.push(
							AssetFactory.createFileScript({
								filepath: resolvedPath,
								position: 'head',
								attributes: {
									type: 'module',
									defer: '',
									...attributes,
								},
							}),
						);
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

				for (const [index, scriptEntry] of (dependenciesConfig?.scripts ?? []).entries()) {
					if (!isDependencyEntryObject(scriptEntry) || !scriptEntry.lazy) {
						continue;
					}

					const lazy = scriptEntry.lazy;
					const content = scriptEntry.content;
					const src = scriptEntry.src;
					const attributes = scriptEntry.attributes;

					if (content) {
						const lazyKey = `lazy:${rapidhash(`${file}:entry:${index}:${content}`).toString(16)}`;
						const depKey = `lazy:entry:content:${getLazyTriggerKey(lazy)}:${content}:${JSON.stringify(attributes ?? {})}`;
						if (!lazyDependencyKeys.has(depKey)) {
							lazyDependencyKeys.add(depKey);
							dependencies.push(
								AssetFactory.createContentScript({
									position: 'head',
									content,
									excludeFromHtml: true,
									attributes: {
										type: 'module',
										defer: '',
										'data-eco-lazy-key': lazyKey,
										...attributes,
									},
								}),
							);
						}

						registerLazyScript({
							lazy,
							lazyKey,
						});
						continue;
					}

					const script =
						src ??
						getDependencyEntrySrcOrThrow(
							scriptEntry,
							'Lazy script dependency entry in dependencies.scripts',
						);
					const resolvedPath = this.resolveDependencyPath(dir, script);
					const fallbackUrl = this.resolveLazyScripts(dir, [script]).split(',')[0] ?? '';
					const lazyKey = `lazy:${rapidhash(`${resolvedPath}:${getLazyTriggerKey(lazy)}`).toString(16)}`;
					const depKey = `lazy:entry:file:${getLazyTriggerKey(lazy)}:${resolvedPath}:${JSON.stringify(attributes ?? {})}`;

					if (!lazyDependencyKeys.has(depKey)) {
						lazyDependencyKeys.add(depKey);
						dependencies.push(
							AssetFactory.createFileScript({
								filepath: resolvedPath,
								position: 'head',
								excludeFromHtml: true,
								attributes: {
									type: 'module',
									defer: '',
									'data-eco-lazy-key': lazyKey,
									...attributes,
								},
							}),
						);
					}

					registerLazyScript({
						lazy,
						lazyKey,
						fallbackUrl,
					});
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
		const lazyKeyToOutputUrl = new Map<string, string>();

		for (const dependency of processedDependencies) {
			if (dependency.kind === 'script' && dependency.srcUrl) {
				const lazyKey = dependency.attributes?.['data-eco-lazy-key'];
				if (lazyKey) {
					lazyKeyToOutputUrl.set(lazyKey, dependency.srcUrl);
				}
			}
		}

		for (const [config, lazyGroupsMap] of lazyScriptsByConfig.entries()) {
			const resolvedGroups: ResolvedLazyScriptGroup[] = [];

			for (const group of lazyGroupsMap.values()) {
				const resolvedUrls = group.scripts
					.map(({ lazyKey, fallbackUrl }) => lazyKeyToOutputUrl.get(lazyKey) ?? fallbackUrl)
					.filter((url): url is string => Boolean(url && url.length > 0));

				if (resolvedUrls.length === 0) {
					continue;
				}

				resolvedGroups.push({
					lazy: group.lazy,
					scripts: Array.from(new Set(resolvedUrls)).join(','),
				});
			}

			config._resolvedLazyScripts = resolvedGroups.length > 0 ? resolvedGroups : undefined;
		}

		return processedDependencies;
	}
}
