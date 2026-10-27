import path from 'node:path';
import { fileURLToPath } from 'node:url';
import MagicString from 'magic-string';
import { parseModuleSource } from '../../cache/module-parse-cache.ts';

export type InstalledPackageExternalBinding = {
	importer: string;
	externalId: string;
	target: string;
	kind?: string;
};

type ModuleAstNode = {
	type?: string;
	start?: number;
	end?: number;
	kind?: string;
	name?: string;
	value?: unknown;
	source?: unknown;
	callee?: unknown;
	arguments?: unknown;
	id?: unknown;
	params?: unknown;
	declarations?: unknown;
	specifiers?: unknown;
	local?: unknown;
	param?: unknown;
	[key: string]: unknown;
};

type ModuleScope = {
	kind: 'program' | 'function' | 'block' | 'catch' | 'loop';
	parent?: ModuleScope;
	bindings: Set<string>;
};

/** Normalizes Rolldown module ids while preserving resource queries and hashes. */
export function normalizeRolldownModuleId(id: string): string {
	const separatorIndex = id.search(/[?#]/u);
	const pathPart = separatorIndex < 0 ? id : id.slice(0, separatorIndex);
	const suffix = separatorIndex < 0 ? '' : id.slice(separatorIndex);
	const filePath = pathPart.startsWith('file:') ? fileURLToPath(pathPart) : pathPart;
	return path.isAbsolute(filePath) ? `${path.resolve(filePath)}${suffix}` : id;
}

/**
 * Rewrites only installed-package module specifiers in one emitted chunk.
 *
 * @remarks
 * Rolldown's chunk metadata identifies the external imports, but the code
 * rewrite must touch only import syntax. Literal strings can contain the same
 * text as an import path, and a locally bound function named `require` is not
 * a module import.
 */
export function rewriteInstalledPackageSpecifiers(
	code: string,
	fileName: string,
	emittedImports: ReadonlyMap<string, string>,
	externalRequireIds: ReadonlySet<string>,
	commonJsOutput: boolean,
): { code: string; map: ReturnType<MagicString['generateMap']> } | null {
	const program = parseModuleSource(fileName, code, { sourceType: 'module', lang: 'js' })
		.program as unknown as ModuleAstNode;
	const unshadowedRequireCalls = collectUnshadowedRequireCalls(program);
	const edits: Array<{ start: number; end: number; replacement: string }> = [];
	walkModuleAst(program, (node) => {
		const source = getModuleSpecifierSource(node);
		if (!source || typeof source.value !== 'string') return;
		if (node.type === 'CallExpression') {
			if (!unshadowedRequireCalls.has(node)) return;
			if (!commonJsOutput && !externalRequireIds.has(source.value)) return;
		}
		const replacement = emittedImports.get(source.value);
		if (replacement === undefined || typeof source.start !== 'number' || typeof source.end !== 'number') return;
		edits.push({ start: source.start, end: source.end, replacement: JSON.stringify(replacement) });
	});
	if (edits.length === 0) return null;

	const source = new MagicString(code);
	for (const edit of edits) source.overwrite(edit.start, edit.end, edit.replacement);
	return {
		code: source.toString(),
		map: source.generateMap({ source: fileName, includeContent: true, hires: 'boundary' }),
	};
}

function isAstNode(value: unknown): value is ModuleAstNode {
	return typeof value === 'object' && value !== null;
}

function walkModuleAst(value: unknown, visit: (node: ModuleAstNode) => void): void {
	if (Array.isArray(value)) {
		for (const child of value) walkModuleAst(child, visit);
		return;
	}
	if (!isAstNode(value)) return;
	visit(value);
	for (const child of Object.values(value)) walkModuleAst(child, visit);
}

/**
 * Identifies global `require()` calls so local functions named `require` are
 * not mistaken for external module specifiers.
 */
function collectUnshadowedRequireCalls(program: ModuleAstNode): WeakSet<ModuleAstNode> {
	const scopesByNode = new WeakMap<ModuleAstNode, ModuleScope>();
	const visitDeclarations = (value: unknown, parentScope: ModuleScope | undefined): void => {
		if (Array.isArray(value)) {
			for (const child of value) visitDeclarations(child, parentScope);
			return;
		}
		if (!isAstNode(value)) return;

		const scopeKind = getModuleScopeKind(value.type);
		const currentScope = scopeKind
			? { kind: scopeKind, parent: parentScope, bindings: new Set<string>() }
			: parentScope;
		if (currentScope) scopesByNode.set(value, currentScope);
		collectModuleBindings(value, currentScope, parentScope);
		for (const child of Object.values(value)) visitDeclarations(child, currentScope);
	};
	visitDeclarations(program, undefined);

	const unshadowedCalls = new WeakSet<ModuleAstNode>();
	walkModuleAst(program, (node) => {
		if (node.type !== 'CallExpression' || !getModuleSpecifierSource(node)) return;
		let scope = scopesByNode.get(node);
		while (scope) {
			if (scope.bindings.has('require')) return;
			scope = scope.parent;
		}
		unshadowedCalls.add(node);
	});
	return unshadowedCalls;
}

function getModuleScopeKind(type: string | undefined): ModuleScope['kind'] | undefined {
	if (type === 'Program') return 'program';
	if (type === 'FunctionDeclaration' || type === 'FunctionExpression' || type === 'ArrowFunctionExpression') {
		return 'function';
	}
	if (type === 'CatchClause') return 'catch';
	if (type === 'ForStatement' || type === 'ForInStatement' || type === 'ForOfStatement') return 'loop';
	if (type === 'BlockStatement' || type === 'SwitchStatement') return 'block';
	return undefined;
}

function collectModuleBindings(
	node: ModuleAstNode,
	currentScope: ModuleScope | undefined,
	parentScope: ModuleScope | undefined,
): void {
	if (!currentScope) return;
	collectVariableBindings(node, currentScope);
	collectImportBindings(node, currentScope);
	collectNamedDeclarationBindings(node, currentScope, parentScope);
	collectFunctionParameterBindings(node, currentScope);
}

function collectVariableBindings(node: ModuleAstNode, currentScope: ModuleScope): void {
	if (node.type !== 'VariableDeclaration' || !Array.isArray(node.declarations)) return;
	const scope = node.kind === 'var' ? nearestFunctionScope(currentScope) : currentScope;
	for (const declaration of node.declarations) {
		if (isAstNode(declaration)) addBindingPattern(declaration.id, scope);
	}
}

function collectImportBindings(node: ModuleAstNode, currentScope: ModuleScope): void {
	if (node.type !== 'ImportDeclaration' || !Array.isArray(node.specifiers)) return;
	for (const specifier of node.specifiers) {
		if (isAstNode(specifier)) addBindingPattern(specifier.local, currentScope);
	}
}

function collectNamedDeclarationBindings(
	node: ModuleAstNode,
	currentScope: ModuleScope,
	parentScope: ModuleScope | undefined,
): void {
	if (!isAstNode(node.id)) return;
	if (node.type === 'FunctionExpression') {
		addBindingPattern(node.id, currentScope);
		return;
	}
	if (node.type !== 'FunctionDeclaration' && node.type !== 'ClassDeclaration') return;
	if (parentScope) addBindingPattern(node.id, parentScope);
}

function collectFunctionParameterBindings(node: ModuleAstNode, scope: ModuleScope): void {
	if (node.type === 'CatchClause') {
		addBindingPattern(node.param, scope);
		return;
	}
	if (
		node.type === 'FunctionDeclaration' ||
		node.type === 'FunctionExpression' ||
		node.type === 'ArrowFunctionExpression'
	) {
		addFunctionParameters(node.params, scope);
	}
}

function nearestFunctionScope(scope: ModuleScope): ModuleScope {
	let current = scope;
	while (current.parent && current.kind !== 'function' && current.kind !== 'program') {
		current = current.parent;
	}
	return current;
}

function addFunctionParameters(parameters: unknown, scope: ModuleScope): void {
	if (Array.isArray(parameters)) {
		for (const parameter of parameters) addBindingPattern(parameter, scope);
		return;
	}
	if (!isAstNode(parameters)) return;
	if (Array.isArray(parameters.items)) {
		for (const parameter of parameters.items) addBindingPattern(parameter, scope);
	}
	addBindingPattern(parameters.rest, scope);
}

function addBindingPattern(value: unknown, scope: ModuleScope): void {
	if (Array.isArray(value)) {
		for (const child of value) addBindingPattern(child, scope);
		return;
	}
	if (!isAstNode(value)) return;
	switch (value.type) {
		case 'Identifier':
			if (typeof value.name === 'string') scope.bindings.add(value.name);
			return;
		case 'RestElement':
			addBindingPattern(value.argument, scope);
			return;
		case 'AssignmentPattern':
			addBindingPattern(value.left, scope);
			return;
		case 'ArrayPattern':
			addBindingPattern(value.elements, scope);
			return;
		case 'ObjectPattern':
			addBindingPattern(value.properties, scope);
			return;
		case 'Property':
			addBindingPattern(value.value, scope);
			return;
		case 'FormalParameter':
			addBindingPattern(value.pattern, scope);
			return;
		default:
			return;
	}
}

function getModuleSpecifierSource(node: ModuleAstNode): ModuleAstNode | undefined {
	if (
		node.type === 'ImportDeclaration' ||
		node.type === 'ExportNamedDeclaration' ||
		node.type === 'ExportAllDeclaration' ||
		node.type === 'ImportExpression'
	) {
		return isAstNode(node.source) ? node.source : undefined;
	}
	if (node.type !== 'CallExpression' || !isAstNode(node.callee)) return undefined;
	if (node.callee.type !== 'Identifier' || node.callee.name !== 'require' || !Array.isArray(node.arguments)) {
		return undefined;
	}
	const source = node.arguments[0];
	return isAstNode(source) && source.type === 'Literal' ? source : undefined;
}
