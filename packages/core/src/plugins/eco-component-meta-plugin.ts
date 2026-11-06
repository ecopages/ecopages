import path from 'node:path';
import { fileSystem } from '@ecopages/file-system';
import MagicString from 'magic-string';
import type { EcoPagesAppConfig } from '../config/internal-types.ts';
import { createJsxImportSourcePragma } from './jsx-import-source.utils.ts';
import type { EcoBuildOnTransformResult, EcoBuildPlugin } from '../build/contracts/build-types.ts';
import { composeSourceMaps, isUsableSourceMap } from '../build/source-maps.ts';
import { createMappedSourceTransformResult } from '../build/mapped-source-transform.ts';
import { parseModuleSource } from '../cache/module-parse-cache.ts';
import { contentHash } from '../utils/content-hash.ts';
import { escapeRegExp } from '../utils/regex-escaping.ts';
import {
	assertDeliverableStylesheetImport,
	collectStaticImports,
	createUndeliverableStylesheetError,
	declaresEcoFactory,
	discoverComponentImports,
	isDeliveredStylesheetImport,
	isReachedByDiscovery,
	type DiscoveredImports,
	type DiscoveryOptions,
} from './component-import-discovery.ts';
import { loadTsconfigPathPrefixes } from './tsconfig-import-resolver.ts';
import { findIntegrationForFile } from './find-integration-for-file.ts';

/**
 * Options for the plugin that attributes Eco Component identities.
 *
 * @remarks
 * The plugin currently uses Build-layer transform, source-map, and parse-cache helpers; #556 tracks
 * moving the reusable plugin transforms behind the Build layer.
 */
export interface EcoComponentDirPluginOptions {
	config: EcoPagesAppConfig;
}

type AstNode = {
	type?: string;
	start?: number;
	end?: number;
	[key: string]: unknown;
};

type SourceEdit =
	| { start: number; end: number; replacement: string }
	| { start: number; end: number; prefix: string; suffix: string };

type SourceEditOptions = {
	prepend?: string;
	append?: string;
};

function applySourceEdits(
	contents: string,
	edits: SourceEdit[],
	filePath: string,
	options: SourceEditOptions = {},
): EcoBuildOnTransformResult {
	if (edits.length === 0 && !options.prepend && !options.append) {
		return { code: contents };
	}

	const editSource = (source: MagicString): void => {
		for (const edit of edits.sort((left, right) => right.start - left.start)) {
			if ('prefix' in edit) {
				source.appendLeft(edit.start, edit.prefix);
				source.appendRight(edit.end, edit.suffix);
				continue;
			}

			if (edit.start === edit.end) {
				source.appendLeft(edit.start, edit.replacement);
			} else if (edit.replacement === '') {
				source.remove(edit.start, edit.end);
			} else {
				source.overwrite(edit.start, edit.end, edit.replacement);
			}
		}

		if (options.prepend) source.prepend(options.prepend);
		if (options.append) source.append(options.append);
	};
	return createMappedSourceTransformResult(contents, filePath, editSource);
}

function isAstNode(value: unknown): value is AstNode {
	return typeof value === 'object' && value !== null;
}

function node(value: unknown): AstNode | undefined {
	return typeof value === 'object' && value !== null ? (value as AstNode) : undefined;
}

function nodes(value: unknown): AstNode[] {
	return Array.isArray(value) ? value.map(node).filter((value): value is AstNode => value !== undefined) : [];
}

function isEcoFactoryCall(node: AstNode): boolean {
	if (node.type !== 'CallExpression' || !isAstNode(node.callee)) return false;
	const callee = node.callee;
	if (callee.type !== 'MemberExpression' && callee.type !== 'StaticMemberExpression') return false;
	if (!isAstNode(callee.object) || callee.object.type !== 'Identifier' || callee.object.name !== 'eco') return false;
	if (!isAstNode(callee.property) || callee.property.type !== 'Identifier') return false;
	return ['page', 'component', 'layout', 'html'].includes(String(callee.property.name));
}

function isIdentityBinding(node: unknown): boolean {
	if (!isAstNode(node) || node.type !== 'CallExpression' || !isAstNode(node.callee)) return false;
	return node.callee.type === 'Identifier' && node.callee.name === 'bindComponentIdentity';
}

/**
 * Visits each `eco.*()` call with the name of the declaration it belongs to.
 *
 * @remarks
 * The name is the nearest enclosing variable or function binding, or `default` inside `export default`; a call
 * bound to neither gets an empty name.
 */
function walkEcoFactoryCalls(node: unknown, binding: string, visit: (call: AstNode, binding: string) => void): void {
	if (Array.isArray(node)) {
		for (const child of node) walkEcoFactoryCalls(child, binding, visit);
		return;
	}
	if (!isAstNode(node)) return;
	if (isEcoFactoryCall(node)) visit(node, binding);
	let scope = binding;
	if (node.type === 'ExportDefaultDeclaration') scope = 'default';
	if ((node.type === 'VariableDeclarator' || node.type === 'FunctionDeclaration') && isAstNode(node.id)) {
		if (node.id.type === 'Identifier') scope = String(node.id.name);
	}
	for (const value of Object.values(node)) walkEcoFactoryCalls(value, scope, visit);
}

function createIdentityLiteral(identitySource: string, filePath: string, integration: string): string {
	const id = BigInt(`0x${contentHash(identitySource, 16)}`).toString(36);
	return `{ id: ${JSON.stringify(id)}, file: ${JSON.stringify(filePath)}, integration: ${JSON.stringify(integration)} }`;
}

function createNamedImportEdit(
	program: AstNode,
	sourceModule: string,
	importedName: string | readonly string[],
): SourceEdit | undefined {
	const importedNames = typeof importedName === 'string' ? [importedName] : [...importedName];
	const imports = (program.body as unknown[]).filter(
		(node): node is AstNode =>
			isAstNode(node) &&
			node.type === 'ImportDeclaration' &&
			isAstNode(node.source) &&
			node.source.value === sourceModule,
	);
	const valueImport = imports.find((node) => node.importKind !== 'type');
	if (!valueImport) {
		return { start: 0, end: 0, replacement: `import { ${importedNames.join(', ')} } from '${sourceModule}';\n` };
	}

	const specifiers = Array.isArray(valueImport.specifiers) ? valueImport.specifiers.filter(isAstNode) : [];
	const existingNames = new Set(
		specifiers.flatMap((specifier) => {
			if (specifier.type !== 'ImportSpecifier' || !isAstNode(specifier.imported)) return [];
			const name = specifier.imported.name ?? specifier.imported.value;
			return typeof name === 'string' ? [name] : [];
		}),
	);
	const missing = importedNames.filter((name) => !existingNames.has(name));
	if (missing.length === 0) return undefined;

	const namedSpecifiers = specifiers.filter((specifier) => specifier.type === 'ImportSpecifier');
	if (namedSpecifiers.length > 0) {
		const lastSpecifier = namedSpecifiers[namedSpecifiers.length - 1]!;
		if (typeof lastSpecifier.end === 'number') {
			return {
				start: lastSpecifier.end,
				end: lastSpecifier.end,
				replacement: `, ${missing.join(', ')}`,
			};
		}
	}

	if (specifiers.some((specifier) => specifier.type === 'ImportNamespaceSpecifier')) {
		return { start: 0, end: 0, replacement: `import { ${missing.join(', ')} } from '${sourceModule}';\n` };
	}

	const defaultSpecifier = specifiers.find((specifier) => specifier.type === 'ImportDefaultSpecifier');
	if (defaultSpecifier && typeof defaultSpecifier.end === 'number') {
		return {
			start: defaultSpecifier.end,
			end: defaultSpecifier.end,
			replacement: `, { ${missing.join(', ')} }`,
		};
	}

	return { start: 0, end: 0, replacement: `import { ${missing.join(', ')} } from '${sourceModule}';\n` };
}

/**
 * Imports the Eco Components plain modules import, so the declaration's component getter can name them.
 *
 * @remarks
 * The imports go at the end of the module: the plain module that imports each Component already evaluates
 * it, so the extra import does not change evaluation order. Specifiers are resolved absolute paths, so they
 * do not depend on how the bundler names the importer.
 */
function createPlainModuleComponentImports(discovered: DiscoveredImports): { locals: string[]; code: string } {
	const locals: string[] = [];
	let code = '';
	if (discovered.plainModuleComponents.length === 0) return { locals, code };
	discovered.plainModuleComponents.forEach(({ file, imported }, index) => {
		const local = `__ecoPlainModuleComponent${index}`;
		const specifier = JSON.stringify(file.split(path.sep).join('/'));
		const name = /^[A-Za-z_$][\w$]*$/.test(imported) ? imported : JSON.stringify(imported);
		code +=
			imported === 'default'
				? `\nimport ${local} from ${specifier};`
				: `\nimport { ${name} as ${local} } from ${specifier};`;
		locals.push(local);
	});
	return { locals, code: code ? `${code}\n` : '' };
}

function serializeDiscoveryArgument(
	discovered: DiscoveredImports | undefined,
	plainModuleComponents: string[] = [],
): string {
	if (
		!discovered ||
		(discovered.components.length === 0 &&
			discovered.stylesheets.length === 0 &&
			discovered.plainModuleStylesheets.length === 0 &&
			discovered.plainModuleComponents.length === 0 &&
			discovered.watchFiles.length === 0)
	) {
		return '';
	}
	const components = [...discovered.components, ...plainModuleComponents].join(', ');
	const plain =
		discovered.plainModuleStylesheets.length > 0
			? `, plainModuleStylesheets: ${JSON.stringify(discovered.plainModuleStylesheets)}`
			: '';
	const watchFiles = discovered.watchFiles.length > 0 ? `, watchFiles: ${JSON.stringify(discovered.watchFiles)}` : '';
	return `, { components: () => [${components}], stylesheets: ${JSON.stringify(discovered.stylesheets)}${plain}${watchFiles} }`;
}

/**
 * Whether the component meta transform moves the side-effect stylesheet imports of `filePath`
 * into its own Component Dependencies, removing them from the module.
 *
 * @remarks
 * Only a module with an `eco.*()` call delivers its own imports. A plain module loses them too, but only a
 * declaration that imports it delivers them, which an HTML Page module script is not, so the HTML Page scan
 * still reports them.
 */
export function stripsSideEffectStylesheetImports(
	config: EcoPagesAppConfig,
	filePath: string,
	contents: string,
): boolean {
	if (!contents.includes('eco.') || !createComponentMetaFilter(config).test(filePath)) return false;
	if (!findIntegrationForFile(config.integrations, filePath)) return false;
	try {
		return declaresEcoFactory(parseModuleSource(filePath, contents, { sourceType: 'module' }).program);
	} catch {
		return false;
	}
}

/**
 * Options for {@link attributeComponentIdentity}.
 */
export type ComponentIdentityAttributionOptions = {
	/** The Integration that owns the module, or `undefined` for a module no Integration owns. */
	integration: string | undefined;
	projectRoot: string;
	jsxImportSource?: string;
	/** Resolves the Integration that owns any file, for the cross-Integration check of discovery. */
	integrationOf?: DiscoveryOptions['integrationOf'];
	/** Receives each side-effect stylesheet import removed from a module without `eco.*()` calls. */
	onStrippedStylesheet?: (source: string) => void;
	/**
	 * Whether a module without `eco.*()` calls loses its delivered stylesheet imports; defaults to `true`.
	 *
	 * @remarks
	 * The build plugin turns it off for a package module outside the app root that discovery has not reached.
	 */
	stripPlainModuleStylesheets?: boolean;
};

/**
 * Removes the local side-effect stylesheet imports of a module without `eco.*()` calls.
 *
 * @remarks
 * Discovery hands those stylesheets to the nearest Eco declaration that imports the module, so no server or
 * browser build sees the import; the build plugin fails at the end of a build for a module no declaration
 * reached. A CSS Module or a package stylesheet in a module an Integration owns throws here, because no
 * declaration could deliver it.
 */
function stripPlainModuleStylesheetImports(
	program: AstNode,
	filePath: string,
	options: ComponentIdentityAttributionOptions,
): SourceEdit[] {
	const edits: SourceEdit[] = [];
	const pathPrefixes = loadTsconfigPathPrefixes(options.projectRoot);
	for (const entry of collectStaticImports(program)) {
		if (entry.attributed || !entry.source.endsWith('.css')) continue;
		if (options.integration) assertDeliverableStylesheetImport(entry, filePath, options.projectRoot, pathPrefixes);
		if (!isDeliveredStylesheetImport(entry, pathPrefixes)) continue;
		edits.push({ start: entry.start, end: entry.end, replacement: '' });
		options.onStrippedStylesheet?.(entry.source);
	}
	return edits;
}

/**
 * Attributes real `eco.*()` factory calls with canonical component identity.
 *
 * @remarks
 * Each call gets its own `id`, hashed from the file, the declaration name, and how many earlier calls in the
 * file share that name. Server and browser builds of one source derive the same id, and a named declaration
 * keeps it while other code in the file changes. Calls bound to no name (an inline argument, a call inside an
 * anonymous function) are numbered in source order, so adding or removing another unnamed call before them
 * changes their id. `file` stays the module path for every call in the file. A module without calls only
 * loses its side-effect stylesheet imports (see {@link stripPlainModuleStylesheetImports}).
 */
export function attributeComponentIdentity(
	contents: string,
	filePath: string,
	options: ComponentIdentityAttributionOptions,
): EcoBuildOnTransformResult {
	const { integration, projectRoot, jsxImportSource } = options;
	const pragma =
		integration && jsxImportSource && !contents.includes('@jsxImportSource')
			? createJsxImportSourcePragma(jsxImportSource)
			: undefined;
	const mayDeclare = integration !== undefined && contents.includes('eco.');
	if (!mayDeclare && !contents.includes('.css')) {
		return applySourceEdits(contents, [], filePath, { prepend: pragma });
	}

	let program: AstNode;
	try {
		program = parseModuleSource(filePath, contents, { sourceType: 'module' }).program as unknown as AstNode;
	} catch {
		return applySourceEdits(contents, [], filePath, { prepend: pragma });
	}

	if (!mayDeclare || !declaresEcoFactory(program)) {
		const edits =
			options.stripPlainModuleStylesheets === false
				? []
				: stripPlainModuleStylesheetImports(program, filePath, options);
		return applySourceEdits(contents, edits, filePath, {
			prepend: pragma,
		});
	}

	const factoryArguments: Array<{ start: number; end: number; identityLiteral: string }> = [];
	const bindingOccurrences = new Map<string, number>();
	walkEcoFactoryCalls(program, '', (node, binding) => {
		const occurrence = bindingOccurrences.get(binding) ?? 0;
		bindingOccurrences.set(binding, occurrence + 1);
		if (!Array.isArray(node.arguments)) return;
		const firstArgument = node.arguments[0];
		if (!isAstNode(firstArgument) || isIdentityBinding(firstArgument)) return;
		if (typeof firstArgument.start !== 'number' || typeof firstArgument.end !== 'number') return;
		factoryArguments.push({
			start: firstArgument.start,
			end: firstArgument.end,
			identityLiteral: createIdentityLiteral(`${filePath}:${binding}:${occurrence}`, filePath, integration),
		});
	});

	if (factoryArguments.length === 0) {
		return applySourceEdits(contents, [], filePath, { prepend: pragma });
	}

	const discovered = discoverComponentImports(program, filePath, projectRoot, {
		integrationOf: options.integrationOf,
		ownerSource: contents,
	});
	const plainModuleImports = createPlainModuleComponentImports(discovered);
	const discoveryArgument = serializeDiscoveryArgument(discovered, plainModuleImports.locals);
	const edits: SourceEdit[] = factoryArguments.map((firstArgument) => ({
		start: firstArgument.start,
		end: firstArgument.end,
		prefix: `bindComponentIdentity(${firstArgument.identityLiteral}, `,
		suffix: `${discoveryArgument})`,
	}));
	edits.push(...discovered.removals);
	const importEdit = createNamedImportEdit(program, '@ecopages/core', 'bindComponentIdentity');
	if (importEdit) edits.push(importEdit);
	return applySourceEdits(contents, edits, filePath, {
		prepend: pragma,
		append: plainModuleImports.code || undefined,
	});
}

function findMdxConfigDeclarator(program: AstNode): AstNode | undefined {
	for (const statement of nodes(program?.body)) {
		if (statement.type !== 'ExportNamedDeclaration' || !statement.declaration) {
			continue;
		}

		const decl = node(statement.declaration);
		if (decl?.type !== 'VariableDeclaration') {
			continue;
		}

		for (const declarator of nodes(decl.declarations)) {
			if (node(declarator.id)?.name === 'config') {
				return declarator;
			}
		}
	}

	return undefined;
}

function buildMdxConfigIdentityEdits(options: {
	contents: string;
	configDeclarator: AstNode | undefined;
	identityLiteral: string;
	discoveryArgument: string;
	removals: SourceEdit[];
}): SourceEdit[] {
	const edits: SourceEdit[] = [...options.removals];
	const init = options.configDeclarator ? node(options.configDeclarator.init) : undefined;

	if (!init || typeof init.start !== 'number' || typeof init.end !== 'number') {
		return edits;
	}

	edits.push({
		start: init.start,
		end: init.end,
		prefix: `bindComponentIdentity(${options.identityLiteral}, `,
		suffix: `${options.discoveryArgument})`,
	});

	return edits;
}

function buildMdxIdentityAppend(options: {
	configDeclarator: AstNode | undefined;
	identityLiteral: string;
	discoveryArgument: string;
}): string {
	let appended = '';
	if (!options.configDeclarator) {
		appended += `\nexport const config = bindComponentIdentity(${options.identityLiteral}, {}${options.discoveryArgument});\n`;
	}
	appended += `attachDiscoveredDependencies(config);\nif (typeof MDXContent === 'function') MDXContent.config = config;\n`;
	return appended;
}

/**
 * Attributes a compiled MDX module with canonical component identity and discovered dependencies.
 *
 * @remarks
 * Pass the MDX compiler's map as `previousMap` so the returned map traces back to the `.mdx` file; without
 * it the map is relative to the compiled module.
 */
export function attributeMdxComponentIdentity(
	contents: string,
	filePath: string,
	integration: string,
	projectRoot: string,
	previousMap?: unknown,
): EcoBuildOnTransformResult {
	if (!projectRoot) {
		throw new Error(`[ecopages] Cannot process MDX dependencies for "${filePath}": projectRoot is required.`);
	}

	let program: AstNode;
	try {
		program = parseModuleSource(filePath, contents, { lang: 'jsx', sourceType: 'module' })
			.program as unknown as AstNode;
	} catch {
		return { code: contents, map: previousMap };
	}

	const configDeclarator = findMdxConfigDeclarator(program);

	if (configDeclarator && isIdentityBinding(configDeclarator.init)) {
		return { code: contents, map: previousMap };
	}

	const discovered = discoverComponentImports(program, filePath, projectRoot);
	const identityLiteral = createIdentityLiteral(filePath, filePath, integration);
	const plainModuleImports = createPlainModuleComponentImports(discovered);
	const discoveryArgument = serializeDiscoveryArgument(discovered, plainModuleImports.locals);

	const edits = buildMdxConfigIdentityEdits({
		contents,
		configDeclarator,
		identityLiteral,
		discoveryArgument,
		removals: discovered.removals,
	});
	const appended = buildMdxIdentityAppend({ configDeclarator, identityLiteral, discoveryArgument });

	const importEdit = createNamedImportEdit(program, '@ecopages/core', [
		'bindComponentIdentity',
		'attachDiscoveredDependencies',
	]);
	if (importEdit) edits.push(importEdit);

	const transformed = applySourceEdits(contents, edits, filePath, {
		append: `\n${appended}${plainModuleImports.code}`,
	});
	return {
		...transformed,
		map:
			isUsableSourceMap(previousMap) && isUsableSourceMap(transformed.map)
				? composeSourceMaps(transformed.map, previousMap)
				: transformed.map,
	};
}

/**
 * Matches the ids of modules with a script extension that an Integration owns, before an optional query.
 *
 * @remarks
 * With no such extension it matches no id, rather than an empty alternation matching all of them.
 */
function createComponentMetaFilter(config: EcoPagesAppConfig): RegExp {
	const extensions = config.integrations
		.flatMap((integration) => integration.extensions)
		.filter((extension) => ['.ts', '.tsx', '.js', '.jsx'].some((suffix) => extension.endsWith(suffix)));
	if (extensions.length === 0) {
		return /(?!)/;
	}
	return new RegExp(`(${extensions.map(escapeRegExp).join('|')})(\\?.*)?$`);
}

/**
 * Creates the build plugin that attributes component identity in every Integration's script files and
 * removes the stylesheet imports discovery delivers from every local script module.
 *
 * @remarks
 * Core adds it to every build request after the app's plugins and before its `import.meta` transform, so no
 * contributed plugin sees the attribution of another. A module no Integration owns can still be a plain
 * module discovery walks, so the filter takes every script outside `node_modules`. A module outside the app
 * root, such as a linked workspace package, is a package: its stylesheet imports are only removed once
 * discovery has reached it, and it never fails the reach check. A build can transform a
 * plain module before the declaration that imports it, so the check that a declaration reached each
 * module that lost a stylesheet import runs once the whole build is transformed.
 */
export function createEcoComponentMetaPlugin(options: EcoComponentDirPluginOptions): EcoBuildPlugin {
	const { integrations, rootDir } = options.config;
	const integrationOf = (file: string) => findIntegrationForFile(integrations, file);
	return {
		name: 'eco-component-identity-attribution',
		setup(build) {
			const strippedStylesheets = new Map<string, string>();
			const appRoot = `${fileSystem.exists(rootDir) ? fileSystem.realpath(rootDir) : path.resolve(rootDir)}${path.sep}`;
			build.transform({ filter: /\.[cm]?[jt]sx?(\?.*)?$/ }, (code, rawId) => {
				const id = rawId.replace(/[?#].*$/, '');
				if (id.includes('/node_modules/') || id.includes('\\node_modules\\')) {
					return { code };
				}
				const integration = findIntegrationForFile(integrations, id);
				const insideApp = (fileSystem.exists(id) ? fileSystem.realpath(id) : id).startsWith(appRoot);
				const stripPlainModuleStylesheets = insideApp || isReachedByDiscovery(rootDir, id);
				if (!integration && !stripPlainModuleStylesheets) {
					return { code };
				}
				return attributeComponentIdentity(code, id, {
					integration: integration?.name,
					projectRoot: rootDir,
					jsxImportSource: integration?.jsxImportSource,
					integrationOf,
					stripPlainModuleStylesheets,
					onStrippedStylesheet: (source) => {
						if (insideApp && !strippedStylesheets.has(id)) strippedStylesheets.set(id, source);
					},
				});
			});
			build.onEnd(() => {
				for (const [file, source] of strippedStylesheets) {
					if (!isReachedByDiscovery(rootDir, file))
						throw createUndeliverableStylesheetError(rootDir, file, source);
				}
			});
		},
	};
}

export default createEcoComponentMetaPlugin;
