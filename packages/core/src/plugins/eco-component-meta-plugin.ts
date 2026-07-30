import type { EcoPagesAppConfig } from '../types/internal-types.ts';
import { prependJsxImportSourceIfMissing } from './jsx-import-source.utils.ts';
import type { EcoSourceTransform, EcoViteCompatiblePlugin } from './source-transform.ts';
import { createEcoBuildPluginFromSourceTransform, createVitePluginFromSourceTransform } from './source-transform.ts';
import type { EcoBuildPlugin } from '../build/contracts/build-types.ts';
import { parseModuleSource } from '../cache/module-parse-cache.ts';
import { rapidhash } from '../utils/hash.ts';

type IntegrationOwnership = { name: string; jsxImportSource?: string };

export interface EcoComponentDirPluginOptions {
	config: EcoPagesAppConfig;
}

function integrationForFile(filePath: string, config: EcoPagesAppConfig): IntegrationOwnership {
	const candidates = config.integrations
		.flatMap((integration) => integration.extensions.map((extension) => [extension, integration] as const))
		.sort(([left], [right]) => right.length - left.length);
	const match = candidates.find(([extension]) => filePath.endsWith(extension));
	return match ? { name: match[1].name, jsxImportSource: match[1].jsxImportSource } : { name: 'ghtml' };
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

function addIdentityBindingImport(contents: string, program: AstNode): string {
	const imports = (program.body as unknown[]).filter(
		(node): node is AstNode =>
			isAstNode(node) &&
			node.type === 'ImportDeclaration' &&
			isAstNode(node.source) &&
			node.source.value === '@ecopages/core',
	);
	const valueImport = imports.find((node) => node.importKind !== 'type');
	if (!valueImport) return `import { bindComponentIdentity } from '@ecopages/core';\n${contents}`;

	const specifiers = Array.isArray(valueImport.specifiers) ? valueImport.specifiers.filter(isAstNode) : [];
	if (
		specifiers.some(
			(specifier) =>
				specifier.type === 'ImportSpecifier' &&
				isAstNode(specifier.imported) &&
				specifier.imported.name === 'bindComponentIdentity',
		)
	) {
		return contents;
	}

	const namedSpecifiers = specifiers.filter((specifier) => specifier.type === 'ImportSpecifier');
	if (namedSpecifiers.length > 0) {
		const lastSpecifier = namedSpecifiers[namedSpecifiers.length - 1]!;
		return `${contents.slice(0, lastSpecifier.end)}, bindComponentIdentity${contents.slice(lastSpecifier.end)}`;
	}

	if (specifiers.some((specifier) => specifier.type === 'ImportNamespaceSpecifier')) {
		return `import { bindComponentIdentity } from '@ecopages/core';\n${contents}`;
	}

	const defaultSpecifier = specifiers.find((specifier) => specifier.type === 'ImportDefaultSpecifier');
	if (defaultSpecifier) {
		return `${contents.slice(0, defaultSpecifier.end)}, { bindComponentIdentity }${contents.slice(defaultSpecifier.end)}`;
	}

	return `import { bindComponentIdentity } from '@ecopages/core';\n${contents}`;
}

/** Attributes real `eco.*()` factory calls with canonical component identity. */
export function attributeComponentIdentity(contents: string, filePath: string, integration: string): string {
	if (!contents.includes('eco.')) return contents;

	let program: AstNode;
	try {
		program = parseModuleSource(filePath, contents).program as unknown as AstNode;
	} catch {
		return contents;
	}

	const identityLiteral = `{ id: ${JSON.stringify(rapidhash(filePath).toString(36))}, file: ${JSON.stringify(filePath)}, integration: ${JSON.stringify(integration)} }`;
	const edits: SourceEdit[] = [];
	walkAst(program, (node) => {
		if (!isEcoFactoryCall(node) || !Array.isArray(node.arguments)) return;
		const firstArgument = node.arguments[0];
		if (!isAstNode(firstArgument) || isIdentityBinding(firstArgument)) return;
		if (typeof firstArgument.start !== 'number' || typeof firstArgument.end !== 'number') return;
		edits.push({
			start: firstArgument.start,
			end: firstArgument.end,
			replacement: `bindComponentIdentity(${identityLiteral}, ${contents.slice(firstArgument.start, firstArgument.end)})`,
		});
	});
	if (edits.length === 0) return contents;

	let transformed = contents;
	for (const edit of edits.sort((left, right) => right.start - left.start)) {
		transformed = `${transformed.slice(0, edit.start)}${edit.replacement}${transformed.slice(edit.end)}`;
	}
	return addIdentityBindingImport(transformed, program);
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
			if (id.endsWith('.mdx')) return { code };
			const integration = integrationForFile(id, options.config);
			return {
				code: prependJsxImportSourceIfMissing(
					attributeComponentIdentity(code, id, integration.name),
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
