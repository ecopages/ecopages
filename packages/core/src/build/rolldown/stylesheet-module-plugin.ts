import { fileSystem } from '@ecopages/file-system';
import type { RolldownPlugin } from 'rolldown';
import { code as codeFilter, id as idFilter, include } from 'rolldown/filter';
import { collectStaticImports } from '../../plugins/component-import-discovery.ts';
import { PLAIN_CSS_KINDS } from '../../plugins/stylesheet-kinds.ts';
import { parseModuleSource } from '../../cache/module-parse-cache.ts';
import { escapeRegExp } from '../../utils/regex-escaping.ts';
import { toStylesheetModule } from '../../assets/asset-processing-service/processors/stylesheet/stylesheet-module.ts';
import type { BuildStylesheets } from '../contracts/build-contracts.ts';
import { fromRolldownModuleId, toRolldownModuleId } from './rolldown-module-id.ts';

const SIDE_EFFECT_QUERY = '?ecopages-stylesheet-side-effect';

/** Plain CSS, default-exported as written: the stylesheets of a build request that names none. */
const PLAIN_CSS_STYLESHEETS: BuildStylesheets = {
	extensions: PLAIN_CSS_KINDS.extensions,
	compileModule: async (file) => toStylesheetModule(await fileSystem.readFile(file)),
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
 * @param stylesheets - The stylesheet extensions and the compiler; defaults to plain `.css` exported as written.
 */
export function createStylesheetModulePlugin(stylesheets: BuildStylesheets = PLAIN_CSS_STYLESHEETS): RolldownPlugin {
	const extensionPattern = stylesheets.extensions.map(escapeRegExp).join('|');
	const STYLESHEET_ID = new RegExp(`(?:${extensionPattern})$`, 'iu');
	const SIDE_EFFECT_ID = new RegExp(`(?:${extensionPattern})${escapeRegExp(SIDE_EFFECT_QUERY)}$`, 'iu');
	const STYLESHEET_REFERENCE = new RegExp(`(?:${extensionPattern})['"]`, 'iu');
	const isStylesheet = (specifier: string) => STYLESHEET_ID.test(specifier);
	const sideEffectImportsByImporter = new Map<string, Set<string>>();

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
		resolveId: {
			filter: [include(idFilter(STYLESHEET_ID))],
			async handler(source, importer, extraOptions) {
				if (!importer || !sideEffectImportsByImporter.get(importer)?.has(source)) return null;
				const resolved = await this.resolve(source, importer, { ...extraOptions, skipSelf: true });
				if (!resolved || resolved.external) return resolved;
				return toRolldownModuleId(`${fromRolldownModuleId(resolved.id)}${SIDE_EFFECT_QUERY}`);
			},
		},
		load: {
			filter: [include(idFilter(STYLESHEET_ID)), include(idFilter(SIDE_EFFECT_ID))],
			async handler(id) {
				if (id.endsWith(SIDE_EFFECT_QUERY)) {
					return { code: 'export default "";', moduleType: 'js', moduleSideEffects: true };
				}
				return { code: await stylesheets.compileModule(fromRolldownModuleId(id)), moduleType: 'js' };
			},
		},
	};
}
