import type { EcoPagesAppConfig } from '../types/internal-types.ts';
import { RolldownMagicString } from 'rolldown';
import { createJsxImportSourcePragma } from './jsx-import-source.utils.ts';
import type { EcoSourceTransform, EcoViteCompatiblePlugin } from './source-transform.ts';
import { createEcoBuildPluginFromSourceTransform, createVitePluginFromSourceTransform } from './source-transform.ts';
import type { EcoBuildPlugin } from '../build/contracts/build-types.ts';
import { parseModuleSource } from '../cache/module-parse-cache.ts';
import { rapidhash } from '../utils/hash.ts';
import { discoverComponentImports, type DiscoveredImports } from './component-import-discovery.ts';
import { findIntegrationForFile } from './find-integration-for-file.ts';

export interface EcoComponentDirPluginOptions {
	config: EcoPagesAppConfig;
}

type AstNode = {
	type?: string;
	start?: number;
	end?: number;
	[key: string]: unknown;
};

type SourceEdit = { start: number; end: number; replacement: string };

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

function walkAst(node: unknown, visit: (node: AstNode) => void): void {
	if (Array.isArray(node)) {
		for (const child of node) walkAst(child, visit);
		return;
	}
	if (!isAstNode(node)) return;
	visit(node);
	for (const value of Object.values(node)) walkAst(value, visit);
}

function addNamedImport(
	magic: RolldownMagicString,
	program: AstNode,
	sourceModule: string,
	importedName: string | readonly string[],
): void {
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
		magic.prepend(`import { ${importedNames.join(', ')} } from '${sourceModule}';\n`);
		return;
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
	if (missing.length === 0) {
		return;
	}

	const namedSpecifiers = specifiers.filter((specifier) => specifier.type === 'ImportSpecifier');
	const lastNamedSpecifier = namedSpecifiers[namedSpecifiers.length - 1];
	if (typeof lastNamedSpecifier?.end === 'number') {
		magic.appendLeft(lastNamedSpecifier.end, `, ${missing.join(', ')}`);
		return;
	}

	const defaultSpecifier = specifiers.find((specifier) => specifier.type === 'ImportDefaultSpecifier');
	const hasNamespaceSpecifier = specifiers.some((specifier) => specifier.type === 'ImportNamespaceSpecifier');
	if (!hasNamespaceSpecifier && typeof defaultSpecifier?.end === 'number') {
		magic.appendLeft(defaultSpecifier.end, `, { ${missing.join(', ')} }`);
		return;
	}

	magic.prepend(`import { ${missing.join(', ')} } from '${sourceModule}';\n`);
}

function serializeDiscoveryArgument(discovered: DiscoveredImports | undefined): string {
	if (!discovered || (discovered.components.length === 0 && discovered.stylesheets.length === 0)) {
		return '';
	}
	const watchFiles = discovered.watchFiles.length > 0 ? `, watchFiles: ${JSON.stringify(discovered.watchFiles)}` : '';
	return `, { components: () => [${discovered.components.join(', ')}], stylesheets: ${JSON.stringify(discovered.stylesheets)}${watchFiles} }`;
}

function hasEcoFactoryCall(program: AstNode): boolean {
	let found = false;
	walkAst(program, (node) => {
		if (isEcoFactoryCall(node)) found = true;
	});
	return found;
}

/**
 * Whether the component meta transform moves the side-effect stylesheet imports of `filePath`
 * into its Component Dependencies, removing them from the module.
 */
export function stripsSideEffectStylesheetImports(
	config: EcoPagesAppConfig,
	filePath: string,
	contents: string,
): boolean {
	if (!contents.includes('eco.') || !createComponentMetaFilter(config).test(filePath)) return false;
	if (!findIntegrationForFile(config.integrations, filePath)) return false;
	try {
		return hasEcoFactoryCall(
			parseModuleSource(filePath, contents, { sourceType: 'module' }).program as unknown as AstNode,
		);
	} catch {
		return false;
	}
}

/** Attributes real `eco.*()` factory calls with canonical component identity. */
export function attributeComponentIdentity(
	contents: string,
	filePath: string,
	integration: string,
	projectRoot?: string,
): string {
	const magic = new RolldownMagicString(contents);
	applyComponentIdentity(magic, filePath, integration, projectRoot);
	return magic.toString();
}

/**
 * Wraps the first argument of each `eco.*()` factory call in `bindComponentIdentity(...)`.
 *
 * @remarks
 * Edits go through `magic` so the caller can emit a source map. A factory call
 * nested in the argument of another one is left as is; only the outer call is wrapped.
 */
function applyComponentIdentity(
	magic: RolldownMagicString,
	filePath: string,
	integration: string,
	projectRoot?: string,
): void {
	const contents = magic.original;
	if (!contents.includes('eco.')) return;

	let program: AstNode;
	try {
		program = parseModuleSource(filePath, contents, { sourceType: 'module' }).program as unknown as AstNode;
	} catch {
		return;
	}

	const identityLiteral = `{ id: ${JSON.stringify(rapidhash(filePath).toString(36))}, file: ${JSON.stringify(filePath)}, integration: ${JSON.stringify(integration)} }`;
	const edits: SourceEdit[] = [];
	const hasFactory = hasEcoFactoryCall(program);

	const discovered = hasFactory && projectRoot ? discoverComponentImports(program, filePath, projectRoot) : undefined;
	const discoveryArgument = serializeDiscoveryArgument(discovered);
	const wrapped: Array<{ start: number; end: number }> = [];
	walkAst(program, (node) => {
		if (!isEcoFactoryCall(node) || !Array.isArray(node.arguments)) return;
		const firstArgument = node.arguments[0];
		if (!isAstNode(firstArgument) || isIdentityBinding(firstArgument)) return;
		const { start, end } = firstArgument;
		if (typeof start !== 'number' || typeof end !== 'number') return;
		if (wrapped.some((range) => start >= range.start && end <= range.end)) return;
		wrapped.push({ start, end });
		magic.prependRight(start, `bindComponentIdentity(${identityLiteral}, `);
		magic.appendLeft(end, `${discoveryArgument})`);
	});
	if (wrapped.length === 0) return;
	applySourceEdits(magic, discovered?.removals ?? []);
	addNamedImport(magic, program, '@ecopages/core', 'bindComponentIdentity');
}

function applySourceEdits(magic: RolldownMagicString, edits: readonly SourceEdit[]): void {
	for (const { start, end, replacement } of edits) {
		if (replacement) {
			magic.overwrite(start, end, replacement);
		} else {
			magic.remove(start, end);
		}
	}
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
		replacement: `bindComponentIdentity(${options.identityLiteral}, ${options.contents.slice(init.start, init.end)}${options.discoveryArgument})`,
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

/** Attributes compiled MDX module with canonical component identity and discovered dependencies. */
export function attributeMdxComponentIdentity(
	contents: string,
	filePath: string,
	integration: string,
	projectRoot: string,
): string {
	if (!projectRoot) {
		throw new Error(`[ecopages] Cannot process MDX dependencies for "${filePath}": projectRoot is required.`);
	}

	let program: AstNode;
	try {
		program = parseModuleSource(filePath, contents, { lang: 'jsx', sourceType: 'module' })
			.program as unknown as AstNode;
	} catch {
		return contents;
	}

	const configDeclarator = findMdxConfigDeclarator(program);

	if (configDeclarator && isIdentityBinding(configDeclarator.init)) {
		return contents;
	}

	const discovered = discoverComponentImports(program, filePath, projectRoot);
	const identityLiteral = `{ id: ${JSON.stringify(rapidhash(filePath).toString(36))}, file: ${JSON.stringify(filePath)}, integration: ${JSON.stringify(integration)} }`;
	const discoveryArgument = serializeDiscoveryArgument(discovered);

	const edits = buildMdxConfigIdentityEdits({
		contents,
		configDeclarator,
		identityLiteral,
		discoveryArgument,
		removals: discovered.removals,
	});
	const appended = buildMdxIdentityAppend({ configDeclarator, identityLiteral, discoveryArgument });

	const magic = new RolldownMagicString(contents);
	applySourceEdits(magic, edits);
	magic.append(`\n${appended}`);
	addNamedImport(magic, program, '@ecopages/core', ['bindComponentIdentity', 'attachDiscoveredDependencies']);
	return magic.toString();
}

function createComponentMetaFilter(config: EcoPagesAppConfig): RegExp {
	const extensions = config.integrations
		.flatMap((integration) => integration.extensions)
		.filter((extension) => ['.ts', '.tsx', '.js', '.jsx'].some((suffix) => extension.endsWith(suffix)))
		.map((extension) => extension.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
	return new RegExp(`(${extensions.join('|')})(\\?.*)?$`);
}

export function createEcoComponentMetaTransform(options: EcoComponentDirPluginOptions): EcoSourceTransform {
	return {
		name: 'eco-component-identity-attribution',
		enforce: 'pre',
		filter: createComponentMetaFilter(options.config),
		transform(code, id) {
			const integration = findIntegrationForFile(options.config.integrations, id);
			if (!integration) {
				return undefined;
			}
			const magic = new RolldownMagicString(code);
			applyComponentIdentity(magic, id, integration.name, options.config.rootDir);
			if (integration.jsxImportSource && !code.includes('@jsxImportSource')) {
				magic.prepend(createJsxImportSourcePragma(integration.jsxImportSource));
			}
			if (!magic.hasChanged()) {
				return undefined;
			}
			return { code: magic.toString(), map: magic.generateMap({ source: id, hires: true }).toString() };
		},
	};
}

export function createEcoComponentMetaVitePlugin(options: EcoComponentDirPluginOptions): EcoViteCompatiblePlugin {
	return createVitePluginFromSourceTransform(createEcoComponentMetaTransform(options));
}

export function createEcoComponentMetaPlugin(options: EcoComponentDirPluginOptions): EcoBuildPlugin {
	return createEcoBuildPluginFromSourceTransform(createEcoComponentMetaTransform(options));
}

export default createEcoComponentMetaTransform;
