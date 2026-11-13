/**
 * Codemod: migrate-data-hooks
 *
 * Renames the `eco.page()` data hooks and drops their envelopes.
 *
 * Before:
 *   eco.page({
 *     staticPaths: async () => ({ paths: [{ params: { slug: 'a' } }] }),
 *     staticProps: async ({ pathname }) => ({ props: { title: pathname.params.slug } }),
 *     render: ...
 *   })
 *
 * After:
 *   eco.page({
 *     paths: async () => [{ params: { slug: 'a' } }],
 *     props: async ({ pathname }) => ({ title: pathname.params.slug }),
 *     render: ...
 *   })
 *
 * A hook is rewritten only when every value it returns can be unwrapped: an object literal holding just the
 * envelope key, or any expression inside an `async` function, which becomes `(await expr).props`. A hook it
 * cannot rewrite is left unchanged and reported, so the old name still fails loudly with a pointer here.
 * The `GetStaticProps` and `GetStaticPaths` types are renamed to `GetProps` and `GetPaths`.
 */

import type { API, ASTNode, ASTPath, FileInfo, JSCodeshift, Options } from 'jscodeshift';
import { printOptions } from './print-options.ts';

export const parser = 'tsx';

type HookRename = { from: 'staticProps' | 'staticPaths'; to: 'props' | 'paths' };

const HOOKS: readonly HookRename[] = [
	{ from: 'staticProps', to: 'props' },
	{ from: 'staticPaths', to: 'paths' },
];

const TYPE_RENAMES: Readonly<Record<string, string>> = {
	GetStaticProps: 'GetProps',
	GetStaticPaths: 'GetPaths',
};

type FunctionNode = {
	type: 'ArrowFunctionExpression' | 'FunctionExpression' | 'FunctionDeclaration' | 'ObjectMethod';
	async?: boolean;
	body: any;
};

const FUNCTION_TYPES = new Set([
	'ArrowFunctionExpression',
	'FunctionExpression',
	'FunctionDeclaration',
	'ObjectMethod',
]);

function isFunctionNode(node: any): node is FunctionNode {
	return Boolean(node) && FUNCTION_TYPES.has(node.type);
}

function unwrapExpression(node: any): any {
	let current = node;
	while (
		current &&
		(current.type === 'ParenthesizedExpression' ||
			current.type === 'TSAsExpression' ||
			current.type === 'TSSatisfiesExpression')
	) {
		current = current.expression;
	}
	return current;
}

function propertyKeyName(property: any): string | undefined {
	if (property.computed) return undefined;
	const key = property.key;
	if (key?.type === 'Identifier') return key.name;
	if (key?.type === 'StringLiteral') return key.value;
	return undefined;
}

/** Returns the one property an envelope literal holds, or null when the literal is not a plain envelope. */
function readEnvelopeValue(node: any, key: string): any | null {
	const object = unwrapExpression(node);
	if (object?.type !== 'ObjectExpression' || object.properties.length !== 1) return null;
	const [property] = object.properties;
	if (property.type !== 'ObjectProperty' || propertyKeyName(property) !== key) return null;
	return property.value;
}

/** Collects the `return` statements of one function body, without entering nested functions. */
function collectReturns(j: JSCodeshift, fn: FunctionNode): ASTPath<any>[] {
	const returns: ASTPath<any>[] = [];
	j(fn.body as ASTNode)
		.find(j.ReturnStatement)
		.forEach((returnPath) => {
			let parent: ASTPath<any> | null = returnPath.parent;
			while (parent && parent.node !== fn.body) {
				if (isFunctionNode(parent.node)) return;
				parent = parent.parent;
			}
			returns.push(returnPath);
		});
	return returns;
}

/**
 * Rewrites the values a hook function returns from `{ [key]: value }` to `value`.
 *
 * @returns Whether the function was rewritten. The function is left untouched when it is not.
 */
function flattenHookFunction(j: JSCodeshift, fn: FunctionNode, key: string): boolean {
	const isExpressionBody = fn.body.type !== 'BlockStatement';
	const returnedExpressions: Array<{ read: () => any; write: (value: any) => void }> = [];

	if (isExpressionBody) {
		returnedExpressions.push({
			read: () => fn.body,
			write: (value) => {
				fn.body = value;
			},
		});
	} else {
		for (const returnPath of collectReturns(j, fn)) {
			if (!returnPath.node.argument) continue;
			returnedExpressions.push({
				read: () => returnPath.node.argument,
				write: (value) => {
					returnPath.node.argument = value;
				},
			});
		}
	}

	const plans = returnedExpressions.map((target) => {
		const expression = target.read();
		const unwrapped = readEnvelopeValue(expression, key);
		return { target, expression, unwrapped };
	});
	if (plans.some((plan) => plan.unwrapped === null) && !fn.async) {
		return false;
	}

	for (const { target, expression, unwrapped } of plans) {
		if (unwrapped !== null) {
			target.write(unwrapped);
			continue;
		}
		target.write(j.memberExpression(j.awaitExpression(expression), j.identifier(key)));
	}
	return true;
}

/** Resolves the function a hook value stands for: an inline function, or a same-file declaration it names. */
function resolveHookFunction(j: JSCodeshift, root: any, value: any): FunctionNode | null {
	const target = unwrapExpression(value);
	if (isFunctionNode(target)) return target;
	if (target?.type !== 'Identifier') return null;

	let resolved: FunctionNode | null = null;
	root.find(j.FunctionDeclaration, { id: { name: target.name } }).forEach((path: ASTPath<any>) => {
		if (path.parent.node.type === 'Program' || path.parent.node.type === 'ExportNamedDeclaration') {
			resolved = path.node as FunctionNode;
		}
	});
	if (resolved) return resolved;

	root.find(j.VariableDeclarator, { id: { type: 'Identifier', name: target.name } }).forEach((path: ASTPath<any>) => {
		const init = unwrapExpression(path.node.init);
		if (isFunctionNode(init)) resolved = init;
	});
	return resolved;
}

function renameKey(property: any, to: string): void {
	if (property.shorthand) {
		property.shorthand = false;
		property.value = property.key;
		property.key = { type: 'Identifier', name: to };
		return;
	}
	if (property.key.type === 'StringLiteral') {
		property.key = { type: 'Identifier', name: to };
		return;
	}
	property.key.name = to;
}

function isEcoPageCall(node: any): boolean {
	const callee = node.callee;
	return (
		callee?.type === 'MemberExpression' &&
		callee.object?.type === 'Identifier' &&
		callee.object.name === 'eco' &&
		callee.property?.type === 'Identifier' &&
		callee.property.name === 'page'
	);
}

export default function transform(file: FileInfo, api: API, _options: Options): string | null {
	const j = api.jscodeshift;
	const root = j(file.source);
	let changed = false;
	const skipped: string[] = [];

	root.find(j.CallExpression)
		.filter((path) => isEcoPageCall(path.node))
		.forEach((path) => {
			const [argument] = path.node.arguments;
			if (argument?.type !== 'ObjectExpression') return;

			for (const { from, to } of HOOKS) {
				const property = argument.properties.find(
					(candidate: any) =>
						(candidate.type === 'ObjectProperty' || candidate.type === 'ObjectMethod') &&
						propertyKeyName(candidate) === from,
				) as any;
				if (!property) continue;

				const hook = property.type === 'ObjectMethod' ? (property as FunctionNode) : null;
				const fn = hook ?? resolveHookFunction(j, root, property.value);

				if (!fn || !flattenHookFunction(j, fn, to)) {
					skipped.push(`${from} in ${file.path}`);
					continue;
				}
				renameKey(property, to);
				changed = true;
			}
		});

	const ecopagesTypeNames = new Set<string>();
	root.find(j.ImportDeclaration)
		.filter((path) => String(path.node.source.value).startsWith('@ecopages/'))
		.forEach((path) => {
			for (const specifier of path.node.specifiers ?? []) {
				if (specifier.type === 'ImportSpecifier' && specifier.imported.name in TYPE_RENAMES) {
					ecopagesTypeNames.add(specifier.imported.name);
				}
			}
		});
	if (ecopagesTypeNames.size > 0) {
		root.find(j.Identifier)
			.filter((path) => ecopagesTypeNames.has(path.node.name))
			.forEach((path) => {
				path.node.name = TYPE_RENAMES[path.node.name] ?? path.node.name;
				changed = true;
			});
	}

	for (const entry of skipped) {
		api.report(
			`migrate-data-hooks: ${entry} returns a value this codemod cannot unwrap. Rename it to props or paths and return the value directly, without the { props } or { paths } envelope.`,
		);
	}

	return changed ? root.toSource(printOptions(file.source)) : null;
}
