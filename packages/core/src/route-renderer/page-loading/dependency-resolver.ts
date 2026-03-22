import path from 'node:path';
import { readFileSync } from 'node:fs';
import type {
	DependencyLazyTrigger,
	EcoComponent,
	EcoComponentScriptEntry,
	LazyTriggerRule,
	ResolvedLazyTrigger,
} from '../../public-types.ts';
import type { EcoPagesAppConfig } from '../../internal-types.ts';
import type {
	AssetDefinition,
	AssetProcessingService,
	ProcessedAsset,
} from '../../services/assets/asset-processing-service/index.ts';
import { rapidhash } from '../../utils/hash.ts';
import { AssetFactory } from '../../services/assets/asset-processing-service/index.ts';
import { normalizeModuleDeclarations } from '../../eco/module-dependencies.ts';
import { parseSync } from 'oxc-parser';

export const DEPENDENCY_ERRORS = {
	INVALID_STYLESHEET_ENTRY: 'Invalid stylesheet dependency entry: expected src or content',
	INVALID_SCRIPT_ENTRY: 'Invalid script dependency entry: expected src or content',
	LAZY_SCRIPT_MISSING_SRC: 'Lazy script dependency entry in dependencies.scripts requires a src value',
} as const;

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

	for (const node of result.program.body ?? []) {
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
				const importedName =
					spec.imported?.type === 'Identifier'
						? spec.imported.name
						: spec.imported?.type === 'Literal'
							? spec.imported.value
							: spec.local?.name;
				namedImports.push(importedName);
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

function isDependencyEntryObject(entry: string | EcoComponentScriptEntry): entry is EcoComponentScriptEntry {
	return typeof entry === 'object' && entry !== null;
}

function getDependencyEntrySrc(entry: string | EcoComponentScriptEntry): string | undefined {
	return isDependencyEntryObject(entry) ? entry.src : entry;
}

/**
 * Reads inline dependency content from an entry object.
 * Returns `undefined` for string entries.
 */
function getDependencyEntryContent(entry: string | EcoComponentScriptEntry): string | undefined {
	return isDependencyEntryObject(entry) ? entry.content : undefined;
}

/**
 * Reads optional HTML tag attributes from an entry object.
 * Returns `undefined` for string entries.
 */
function getDependencyEntryAttributes(entry: string | EcoComponentScriptEntry): Record<string, string> | undefined {
	return isDependencyEntryObject(entry) ? entry.attributes : undefined;
}

/**
 * Resolves the `src` field from a dependency entry and throws when absent.
 *
 * Used for entry forms where a file-backed source is mandatory
 * (for example certain lazy script code paths).
 */
function getDependencyEntrySrcOrThrow(entry: string | EcoComponentScriptEntry, errorMessage: string): string {
	const src = getDependencyEntrySrc(entry);
	if (!src) {
		throw new Error(errorMessage);
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

type ResolvedLazyGroup = { lazy: DependencyLazyTrigger; scripts: string[] };

/**
 * Derives a deterministic `triggerId` and the full set of `LazyTriggerRule` entries
 * for a component's lazy script groups.
 *
 * The trigger ID is a hex digest of `rapidhash(componentFile + ':' + sortedUrls)`,
 * making it stable across renders as long as the source file path and resolved
 * script URLs do not change. Sorting the URLs before hashing ensures the ID is
 * independent of declaration order in the component config.
 *
 * Scripts are received as plain arrays (already deduplicated by the caller) to
 * avoid a CSV round-trip that would otherwise require `split(',')` here.
 */
function buildResolvedLazyTriggers(
	config: NonNullable<EcoComponent['config']>,
	groups: ResolvedLazyGroup[],
): ResolvedLazyTrigger[] {
	if (groups.length === 0) return [];

	const componentFile = config.__eco?.file ?? '';
	const sortedUrls = groups
		.flatMap((group) => group.scripts)
		.sort()
		.join(',');
	const triggerId = `eco-trigger-${rapidhash(`${componentFile}:${sortedUrls}`).toString(16)}`;

	const rules: LazyTriggerRule[] = groups.map((group) => {
		const { scripts, lazy } = group;

		if ('on:idle' in lazy) {
			return { 'on:idle': { scripts } };
		}
		if ('on:interaction' in lazy) {
			return { 'on:interaction': { value: lazy['on:interaction'], scripts } };
		}
		if ('on:visible' in lazy) {
			const visibleSelector = lazy['on:visible'];
			if (visibleSelector === true) return { 'on:visible': { scripts } };
			return { 'on:visible': { value: String(visibleSelector), scripts } };
		}
		throw new Error(`Unknown lazy trigger kind: ${JSON.stringify(lazy)}`);
	});

	return [{ triggerId, rules }];
}

export class DependencyResolverService {
	private appConfig: EcoPagesAppConfig;
	private assetProcessingService: AssetProcessingService;

	/**
	 * Creates the dependency resolver used by route and component rendering.
	 *
	 * @remarks
	 * The resolver stays intentionally separate from HTML rendering so component
	 * dependency collection, lazy trigger grouping, and processed-asset generation
	 * can evolve without changing renderer implementations.
	 */
	constructor(appConfig: EcoPagesAppConfig, assetProcessingService: AssetProcessingService) {
		this.appConfig = appConfig;
		this.assetProcessingService = assetProcessingService;
	}

	/**
	 * Resolves one dependency path relative to the component that declared it.
	 */
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
	 * Lazy dependencies are always resolved into global-injector trigger maps.
	 */
	async processComponentDependencies(
		components: Array<EcoComponent | Partial<EcoComponent> | undefined | null>,
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
			if (!component) continue;

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
							throw new Error(DEPENDENCY_ERRORS.INVALID_STYLESHEET_ENTRY);
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
							throw new Error(DEPENDENCY_ERRORS.INVALID_SCRIPT_ENTRY);
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
						src ?? getDependencyEntrySrcOrThrow(scriptEntry, DEPENDENCY_ERRORS.LAZY_SCRIPT_MISSING_SRC);
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
						if (nestedComponent?.config) {
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
			const rawGroups: ResolvedLazyGroup[] = [];

			for (const group of lazyGroupsMap.values()) {
				const resolvedUrls = group.scripts
					.map(({ lazyKey, fallbackUrl }) => lazyKeyToOutputUrl.get(lazyKey) ?? fallbackUrl)
					.filter((url): url is string => Boolean(url && url.length > 0));

				if (resolvedUrls.length === 0) {
					continue;
				}

				rawGroups.push({ lazy: group.lazy, scripts: Array.from(new Set(resolvedUrls)) });
			}

			if (hasLazyDependencies) {
				config._resolvedLazyTriggers = buildResolvedLazyTriggers(config, rawGroups);
				config._resolvedLazyScripts = undefined;
			}
		}

		return processedDependencies;
	}
}
