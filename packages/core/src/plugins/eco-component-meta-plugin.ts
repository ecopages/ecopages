import remapping, { type SourceMapInput as RemappingSourceMapInput } from '@jridgewell/remapping';
import MagicString from 'magic-string';
import type { EcoPagesAppConfig } from '../types/internal-types.ts';
import { createJsxImportSourcePragma } from './jsx-import-source.utils.ts';
import type { EcoSourceTransform, EcoSourceTransformResult } from './source-transform.ts';
import { createEcoBuildPluginFromSourceTransform, createMappedSourceTransformResult } from './source-transform.ts';
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

type SourceEdit =
	| { start: number; end: number; replacement: string }
	| { start: number; end: number; prefix: string; suffix: string };

type SourceEditOptions = {
	prepend?: string;
	append?: string;
	includeSourceMap?: boolean;
};

function applySourceEdits(
	contents: string,
	edits: SourceEdit[],
	filePath: string,
	options: SourceEditOptions = {},
): EcoSourceTransformResult {
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
	if (options.includeSourceMap === false) {
		const source = new MagicString(contents, { filename: filePath });
		editSource(source);
		return { code: source.toString() };
	}
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

function walkAst(node: unknown, visit: (node: AstNode) => void): void {
	if (Array.isArray(node)) {
		for (const child of node) walkAst(child, visit);
		return;
	}
	if (!isAstNode(node)) return;
	visit(node);
	for (const value of Object.values(node)) walkAst(value, visit);
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
	return attributeComponentIdentityWithMap(contents, filePath, integration, projectRoot, undefined, false).code;
}

function attributeComponentIdentityWithMap(
	contents: string,
	filePath: string,
	integration: string,
	projectRoot?: string,
	jsxImportSource?: string,
	includeSourceMap = true,
): EcoSourceTransformResult {
	const pragma =
		jsxImportSource && !contents.includes('@jsxImportSource')
			? createJsxImportSourcePragma(jsxImportSource)
			: undefined;
	if (!contents.includes('eco.')) {
		return applySourceEdits(contents, [], filePath, { prepend: pragma, includeSourceMap });
	}

	let program: AstNode;
	try {
		program = parseModuleSource(filePath, contents, { sourceType: 'module' }).program as unknown as AstNode;
	} catch {
		return applySourceEdits(contents, [], filePath, { prepend: pragma, includeSourceMap });
	}

	const identityLiteral = `{ id: ${JSON.stringify(rapidhash(filePath).toString(36))}, file: ${JSON.stringify(filePath)}, integration: ${JSON.stringify(integration)} }`;
	if (!hasEcoFactoryCall(program)) {
		return applySourceEdits(contents, [], filePath, { prepend: pragma, includeSourceMap });
	}

	const factoryArguments: Array<{ start: number; end: number }> = [];
	walkAst(program, (node) => {
		if (!isEcoFactoryCall(node) || !Array.isArray(node.arguments)) return;
		const firstArgument = node.arguments[0];
		if (!isAstNode(firstArgument) || isIdentityBinding(firstArgument)) return;
		if (typeof firstArgument.start !== 'number' || typeof firstArgument.end !== 'number') return;
		factoryArguments.push({ start: firstArgument.start, end: firstArgument.end });
	});

	if (factoryArguments.length === 0) {
		return applySourceEdits(contents, [], filePath, { prepend: pragma, includeSourceMap });
	}

	const discovered = projectRoot ? discoverComponentImports(program, filePath, projectRoot) : undefined;
	const discoveryArgument = serializeDiscoveryArgument(discovered);
	const edits: SourceEdit[] = factoryArguments.map((firstArgument) => ({
		start: firstArgument.start,
		end: firstArgument.end,
		prefix: `bindComponentIdentity(${identityLiteral}, `,
		suffix: `${discoveryArgument})`,
	}));
	edits.push(...(discovered?.removals ?? []));
	const importEdit = createNamedImportEdit(program, '@ecopages/core', 'bindComponentIdentity');
	if (importEdit) edits.push(importEdit);
	return applySourceEdits(contents, edits, filePath, { prepend: pragma, includeSourceMap });
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

/** Attributes compiled MDX module with canonical component identity and discovered dependencies. */
export function attributeMdxComponentIdentity(
	contents: string,
	filePath: string,
	integration: string,
	projectRoot: string,
): string {
	return attributeMdxComponentIdentityWithMap(contents, filePath, integration, projectRoot, undefined, false).code;
}

function toRemappingSourceMapInput(value: unknown): RemappingSourceMapInput | undefined {
	if (typeof value === 'string') return value;
	if (typeof value !== 'object' || value === null) return undefined;
	if ('mappings' in value && typeof value.mappings === 'string') return value as RemappingSourceMapInput;
	return undefined;
}

function composeSourceMaps(nextMap: unknown, previousMap: unknown): unknown {
	const next = toRemappingSourceMapInput(nextMap);
	const previous = toRemappingSourceMapInput(previousMap);
	if (!next || !previous) return nextMap;
	return remapping([next, previous], () => null);
}

export function attributeMdxComponentIdentityWithMap(
	contents: string,
	filePath: string,
	integration: string,
	projectRoot: string,
	previousMap?: unknown,
	includeSourceMap = true,
): EcoSourceTransformResult {
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

	const importEdit = createNamedImportEdit(program, '@ecopages/core', [
		'bindComponentIdentity',
		'attachDiscoveredDependencies',
	]);
	if (importEdit) edits.push(importEdit);

	const transformed = applySourceEdits(contents, edits, filePath, {
		append: `\n${appended}`,
		includeSourceMap,
	});
	return {
		...transformed,
		map: includeSourceMap && previousMap ? composeSourceMaps(transformed.map, previousMap) : transformed.map,
	};
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
				return { code };
			}
			return attributeComponentIdentityWithMap(
				code,
				id,
				integration.name,
				options.config.rootDir,
				integration.jsxImportSource,
			);
		},
	};
}

export function createEcoComponentMetaPlugin(options: EcoComponentDirPluginOptions): EcoBuildPlugin {
	return createEcoBuildPluginFromSourceTransform(createEcoComponentMetaTransform(options));
}

export default createEcoComponentMetaTransform;
