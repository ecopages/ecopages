import type { EcoPagesAppConfig } from '../types/internal-types.ts';
import { prependJsxImportSourceIfMissing } from './jsx-import-source.utils.ts';
import type { EcoSourceTransform, EcoViteCompatiblePlugin } from './source-transform.ts';
import { createEcoBuildPluginFromSourceTransform, createVitePluginFromSourceTransform } from './source-transform.ts';
import type { EcoBuildPlugin } from '../build/contracts/build-types.ts';
import { cachedParseSync } from '../cache/module-parse-cache.ts';
import { rapidhash } from '../utils/hash.ts';
import { discoverComponentImports } from './component-import-discovery.ts';

type IntegrationOwnership = { name: string; jsxImportSource?: string };

export interface EcoComponentDirPluginOptions {
	config: EcoPagesAppConfig;
}

function integrationForFile(filePath: string, config: EcoPagesAppConfig): IntegrationOwnership | undefined {
	const candidates = config.integrations
		.flatMap((integration) => integration.extensions.map((extension) => [extension, integration] as const))
		.sort(([left], [right]) => right.length - left.length);
	const match = candidates.find(([extension]) => filePath.endsWith(extension));
	return match ? { name: match[1].name, jsxImportSource: match[1].jsxImportSource } : undefined;
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
	contents: string,
	program: AstNode,
	sourceModule: string,
	importedName: string | readonly string[],
): string {
	const importedNames = typeof importedName === 'string' ? [importedName] : [...importedName];
	const imports = (program.body as unknown[]).filter(
		(node): node is AstNode =>
			isAstNode(node) &&
			node.type === 'ImportDeclaration' &&
			isAstNode(node.source) &&
			node.source.value === sourceModule,
	);
	const valueImport = imports.find((node) => node.importKind !== 'type');
	if (!valueImport) return `import { ${importedNames.join(', ')} } from '${sourceModule}';\n${contents}`;

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
		return contents;
	}

	const namedSpecifiers = specifiers.filter((specifier) => specifier.type === 'ImportSpecifier');
	if (namedSpecifiers.length > 0) {
		const lastSpecifier = namedSpecifiers[namedSpecifiers.length - 1]!;
		return `${contents.slice(0, lastSpecifier.end)}, ${missing.join(', ')}${contents.slice(lastSpecifier.end)}`;
	}

	if (specifiers.some((specifier) => specifier.type === 'ImportNamespaceSpecifier')) {
		return `import { ${missing.join(', ')} } from '${sourceModule}';\n${contents}`;
	}

	const defaultSpecifier = specifiers.find((specifier) => specifier.type === 'ImportDefaultSpecifier');
	if (defaultSpecifier) {
		return `${contents.slice(0, defaultSpecifier.end)}, { ${missing.join(', ')} }${contents.slice(defaultSpecifier.end)}`;
	}

	return `import { ${missing.join(', ')} } from '${sourceModule}';\n${contents}`;
}

function addIdentityBindingImport(contents: string, program: AstNode): string {
	return addNamedImport(contents, program, '@ecopages/core', 'bindComponentIdentity');
}

/** Attributes real `eco.*()` factory calls with canonical component identity. */
export function attributeComponentIdentity(
	contents: string,
	filePath: string,
	integration: string,
	projectRoot?: string,
): string {
	if (!contents.includes('eco.')) return contents;

	let program: AstNode;
	try {
		program = cachedParseSync(filePath, contents, { sourceType: 'module' }).program as unknown as AstNode;
	} catch {
		return contents;
	}

	const identityLiteral = `{ id: ${JSON.stringify(rapidhash(filePath).toString(36))}, file: ${JSON.stringify(filePath)}, integration: ${JSON.stringify(integration)} }`;
	const edits: SourceEdit[] = [];
	let hasFactory = false;
	walkAst(program, (node) => {
		if (isEcoFactoryCall(node)) hasFactory = true;
	});
	const discovered = hasFactory && projectRoot ? discoverComponentImports(program, filePath, projectRoot) : undefined;
	const discoveryArgument =
		discovered && (discovered.components.length || discovered.stylesheets.length)
			? `, { components: () => [${discovered.components.join(', ')}], stylesheets: ${JSON.stringify(discovered.stylesheets)} }`
			: '';
	walkAst(program, (node) => {
		if (!isEcoFactoryCall(node) || !Array.isArray(node.arguments)) return;
		const firstArgument = node.arguments[0];
		if (!isAstNode(firstArgument) || isIdentityBinding(firstArgument)) return;
		if (typeof firstArgument.start !== 'number' || typeof firstArgument.end !== 'number') return;
		edits.push({
			start: firstArgument.start,
			end: firstArgument.end,
			replacement: `bindComponentIdentity(${identityLiteral}, ${contents.slice(firstArgument.start, firstArgument.end)}${discoveryArgument})`,
		});
	});
	if (edits.length === 0) return contents;
	edits.push(...(discovered?.removals ?? []));

	let transformed = contents;
	for (const edit of edits.sort((left, right) => right.start - left.start)) {
		transformed = `${transformed.slice(0, edit.start)}${edit.replacement}${transformed.slice(edit.end)}`;
	}
	return addIdentityBindingImport(
		transformed,
		cachedParseSync(filePath, transformed, { sourceType: 'module' }).program as unknown as AstNode,
	);
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
		program = cachedParseSync(filePath, contents, { lang: 'jsx', sourceType: 'module' })
			.program as unknown as AstNode;
	} catch {
		return contents;
	}

	let configDeclarator: AstNode | undefined;
	for (const statement of nodes(program?.body)) {
		if (statement.type === 'ExportNamedDeclaration' && statement.declaration) {
			const decl = node(statement.declaration);
			if (decl?.type === 'VariableDeclaration') {
				for (const declarator of nodes(decl.declarations)) {
					if (node(declarator.id)?.name === 'config') {
						configDeclarator = declarator;
						break;
					}
				}
			}
		}
	}

	if (configDeclarator && isIdentityBinding(configDeclarator.init)) {
		return contents;
	}

	const discovered = discoverComponentImports(program, filePath, projectRoot);
	const hasDiscovered = discovered.components.length > 0 || discovered.stylesheets.length > 0;
	const identityLiteral = `{ id: ${JSON.stringify(rapidhash(filePath).toString(36))}, file: ${JSON.stringify(filePath)}, integration: ${JSON.stringify(integration)} }`;
	const discoveryArgument = hasDiscovered
		? `, { components: () => [${discovered.components.join(', ')}], stylesheets: ${JSON.stringify(discovered.stylesheets)} }`
		: '';

	const edits: SourceEdit[] = [...discovered.removals];
	if (configDeclarator && isAstNode(configDeclarator.init)) {
		const init = configDeclarator.init;
		if (typeof init.start === 'number' && typeof init.end === 'number') {
			edits.push({
				start: init.start,
				end: init.end,
				replacement: `bindComponentIdentity(${identityLiteral}, ${contents.slice(init.start, init.end)}${discoveryArgument})`,
			});
		}
	}

	let appended = '';
	if (!configDeclarator) {
		appended += `\nexport const config = bindComponentIdentity(${identityLiteral}, {}${discoveryArgument});\n`;
	}
	appended += `attachDiscoveredDependencies(config);\nif (typeof MDXContent === 'function') MDXContent.config = config;\n`;

	let transformed = contents;
	for (const edit of edits.sort((left, right) => right.start - left.start)) {
		transformed = `${transformed.slice(0, edit.start)}${edit.replacement}${transformed.slice(edit.end)}`;
	}
	transformed = `${transformed}\n${appended}`;

	return addNamedImport(
		transformed,
		cachedParseSync(filePath, transformed, { lang: 'jsx', sourceType: 'module' }).program as unknown as AstNode,
		'@ecopages/core',
		['bindComponentIdentity', 'attachDiscoveredDependencies'],
	);
}

export function createEcoComponentMetaTransform(options: EcoComponentDirPluginOptions): EcoSourceTransform {
	const extensions = options.config.integrations
		.flatMap((integration) => integration.extensions)
		.filter((extension) => ['.ts', '.tsx', '.js', '.jsx'].some((suffix) => extension.endsWith(suffix)))
		.map((extension) => extension.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
	const filter = new RegExp(`(${extensions.join('|')})(\\?.*)?$`);
	return {
		name: 'eco-component-identity-attribution',
		enforce: 'pre',
		filter,
		transform(code, id) {
			const integration = integrationForFile(id, options.config);
			if (!integration) {
				return { code };
			}
			return {
				code: prependJsxImportSourceIfMissing(
					attributeComponentIdentity(code, id, integration.name, options.config.rootDir),
					integration.jsxImportSource,
				),
			};
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
