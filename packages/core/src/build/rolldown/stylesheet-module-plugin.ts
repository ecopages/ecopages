import { path } from '@ecopages/file-system/path';
import { fileSystem } from '@ecopages/file-system';
import type { PluginContext, RolldownPlugin } from 'rolldown';
import { code as codeFilter, id as idFilter, include } from 'rolldown/filter';
import {
	collectStaticImports,
	createUndeliverableCssModuleError,
	createUndeliverablePackageCssModuleError,
	createUndeliverablePackageStylesheetError,
	hasDiscoveryRecord,
} from '../../plugins/component-import-discovery.ts';
import { isPathInside } from '../../utils/path-containment.ts';
import { PLAIN_CSS_KINDS } from '../../plugins/stylesheet-kinds.ts';
import { parseModuleSource } from '../../cache/module-parse-cache.ts';
import { escapeRegExp } from '../../utils/regex-escaping.ts';
import { toStylesheetModule } from '../../assets/asset-processing-service/processors/stylesheet/stylesheet-module.ts';
import type { BuildStylesheets } from '../contracts/build-contracts.ts';
import { fromRolldownModuleId, toRolldownModuleId } from './rolldown-module-id.ts';
import type { WatchFilesByModule } from './rolldown-plugin-bridge.ts';

const SIDE_EFFECT_QUERY = '?ecopages-stylesheet-side-effect';

/** Plain CSS, default-exported as written: the stylesheets of a build request that names none. */
const PLAIN_CSS_STYLESHEETS: BuildStylesheets = {
	extensions: PLAIN_CSS_KINDS.extensions,
	isCssModule: PLAIN_CSS_KINDS.isCssModule,
	compileModule: async (file) => ({ code: toStylesheetModule(await fileSystem.readFile(file)) }),
};

/**
 * The specifiers of stylesheets `code` imports only for their side effects, as in `import './card.css'`.
 *
 * @remarks
 * A module that does not parse, such as one another plugin has not finished compiling, lists none, so its
 * stylesheet imports compile: the safe choice, since an unused default export is dropped from the output.
 */
function collectSideEffectStylesheetImports(
	code: string,
	id: string,
	isStylesheet: (specifier: string) => boolean,
): Set<string> {
	const file = fromRolldownModuleId(id).replace(/[?#].*$/u, '');
	let imports: ReturnType<typeof collectStaticImports>;
	try {
		imports = collectStaticImports(parseModuleSource(file, code, { sourceType: 'module' }).program);
	} catch {
		return new Set();
	}
	const stylesheetImports = imports.filter((entry) => isStylesheet(entry.source));
	const bound = new Set(stylesheetImports.filter((entry) => !entry.sideEffectOnly).map((entry) => entry.source));
	return new Set(
		stylesheetImports
			.filter((entry) => entry.sideEffectOnly && !bound.has(entry.source))
			.map((entry) => entry.source),
	);
}

/**
 * Builds the Rolldown plugin that gives every stylesheet import of a build one module shape, in server builds and
 * browser bundles alike.
 *
 * @remarks
 * - A binding import (`import styles from './card.css'`) loads the module `stylesheets.compileModule` returns: the
 *   processed CSS as its default export.
 * - A side-effect import (`import './card.css'`) loads an empty module. The component meta transform removes the side
 *   effect imports of app modules, whose CSS reaches the Page as a Dependency, so the ones left come from packages.
 *
 * Its `transform` runs after every other plugin's, so it reads each module as Rolldown parses it, and lists the side
 * effect stylesheet imports there. A side-effect import resolves through the other plugins first and keeps their
 * result when it is external, so a build that externalizes its imports, such as the dev transform server's, keeps
 * doing so; its id gets a query, so the same file imported with a binding stays a separate, compiled module.
 *
 * A package module's own CSS Module import fails a build when no declaration reaches the module, since its CSS would
 * never reach a Page, unless `stylesheets.reportUndeliverable` takes the error. A package module's own side-effect import in a browser build fails it, since its CSS would never reach a Page, unless
 * `stylesheets.reportUndeliverable` takes the error. The import of a package discovery reached never gets here: the
 * component meta transform removed it.
 *
 * The files a compiled stylesheet inlined are declared with `addWatchFile` and recorded in `watchFiles` under its
 * module, so they join the module closure of every entry that imports it.
 *
 * @param build - The build's environment and root; a module under `node_modules` or outside the root is a package.
 * @param stylesheets - The stylesheet extensions and the compiler; defaults to plain `.css` exported as written.
 * @param watchFiles - Receives the files each compiled stylesheet inlined, by module id.
 */
export function createStylesheetModulePlugin(
	build: { environment: 'server' | 'browser'; root: string },
	stylesheets: BuildStylesheets | undefined,
	watchFiles: WatchFilesByModule,
): RolldownPlugin {
	const compiler = stylesheets ?? PLAIN_CSS_STYLESHEETS;
	const extensionPattern = compiler.extensions.map(escapeRegExp).join('|');
	const STYLESHEET_ID = new RegExp(`(?:${extensionPattern})$`, 'iu');
	const SIDE_EFFECT_ID = new RegExp(`(?:${extensionPattern})${escapeRegExp(SIDE_EFFECT_QUERY)}$`, 'iu');
	const isCssModule = compiler.isCssModule ?? PLAIN_CSS_KINDS.isCssModule;
	const STYLESHEET_REFERENCE = new RegExp(`(?:${extensionPattern})['"]`, 'iu');
	const isStylesheet = (specifier: string) => STYLESHEET_ID.test(specifier);
	const sideEffectImportsByImporter = new Map<string, Set<string>>();
	const appRoot = fileSystem.exists(build.root) ? path.fromNative(fileSystem.realpath(build.root)) : build.root;

	const report = (error: Error) => {
		if (!compiler.reportUndeliverable) throw error;
		compiler.reportUndeliverable(error);
	};
	const unreachedAppCssModules: Array<{ importerFile: string; cssFile: string; source: string }> = [];

	const checkCssModule = async (
		context: { resolve: PluginContext['resolve'] },
		importer: string,
		source: string,
		extraOptions: Parameters<PluginContext['resolve']>[2],
	) => {
		const importerFile = fromRolldownModuleId(importer).replace(/[?#].*$/u, '');
		if (hasDiscoveryRecord(build.root, importerFile)) return;
		const fromPackage = importerFile.includes('/node_modules/') || !isPathInside(importerFile, appRoot);
		if (fromPackage) {
			report(createUndeliverablePackageCssModuleError(appRoot, importerFile, source));
			return;
		}
		const resolved = await context.resolve(source, importer, { ...extraOptions, skipSelf: true });
		if (!resolved || resolved.external) return;
		unreachedAppCssModules.push({
			importerFile,
			cssFile: fromRolldownModuleId(resolved.id).replace(/[?#].*$/u, ''),
			source,
		});
	};

	return {
		name: 'ecopages:stylesheet-modules',
		transform: {
			order: 'post',
			filter: [include(codeFilter(STYLESHEET_REFERENCE))],
			handler(code, id) {
				sideEffectImportsByImporter.set(id, collectSideEffectStylesheetImports(code, id, isStylesheet));
				return null;
			},
		},
		buildEnd() {
			for (const { importerFile, cssFile, source } of unreachedAppCssModules) {
				if (hasDiscoveryRecord(build.root, importerFile) || hasDiscoveryRecord(build.root, cssFile)) continue;
				report(createUndeliverableCssModuleError(appRoot, importerFile, source));
			}
		},
		resolveId: {
			filter: [include(idFilter(STYLESHEET_ID))],
			async handler(source, importer, extraOptions) {
				if (!importer) return null;
				if (!sideEffectImportsByImporter.get(importer)?.has(source)) {
					if (isCssModule(source)) await checkCssModule(this, importer, source, extraOptions);
					return null;
				}
				const resolved = await this.resolve(source, importer, { ...extraOptions, skipSelf: true });
				if (!resolved || resolved.external) return resolved;
				const importerFile = fromRolldownModuleId(importer).replace(/[?#].*$/u, '');
				const fromPackage = importerFile.includes('/node_modules/') || !isPathInside(importerFile, appRoot);
				if (build.environment === 'browser' && fromPackage) {
					const error = createUndeliverablePackageStylesheetError(appRoot, importerFile, source);
					if (!compiler.reportUndeliverable) throw error;
					compiler.reportUndeliverable(error);
				}
				return toRolldownModuleId(`${fromRolldownModuleId(resolved.id)}${SIDE_EFFECT_QUERY}`);
			},
		},
		load: {
			filter: [include(idFilter(STYLESHEET_ID)), include(idFilter(SIDE_EFFECT_ID))],
			async handler(id) {
				if (id.endsWith(SIDE_EFFECT_QUERY)) {
					return { code: 'export default "";', moduleType: 'js', moduleSideEffects: true };
				}
				const file = fromRolldownModuleId(id);
				const { code, dependencies = [] } = await compiler.compileModule(file);
				for (const dependency of dependencies) {
					this.addWatchFile(dependency);
				}
				if (dependencies.length > 0) {
					watchFiles.set(file, new Set([...(watchFiles.get(file) ?? []), ...dependencies]));
				}
				return { code, moduleType: 'js' };
			},
		},
	};
}
