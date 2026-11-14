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
 * cannot rewrite is left unchanged and reported, so the old name still fails loudly with a pointer to the migration docs.
 * The `GetStaticProps` and `GetStaticPaths` types are renamed to `GetProps` and `GetPaths`.
 *
 * @remarks
 * This file is deliberately self-contained, with no import beyond `jscodeshift` types, because
 * `@ecopages/codemod` is not published: users run it from its raw GitHub URL with `npx jscodeshift`.
 */

import type {
	API,
	ASTNode,
	ASTPath,
	Collection,
	FileInfo,
	JSCodeshift,
	ObjectMethod,
	ObjectProperty,
	Options,
} from 'jscodeshift';

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

/**
 * The function node types a hook can be written as.
 *
 * @remarks
 * Node shapes are read through the narrow structural types below instead of the full `ast-types` unions,
 * because the Babel `tsx` parser yields node types (`ObjectProperty`, `ObjectMethod`, `TSSatisfiesExpression`)
 * that the exported unions do not all list.
 */
type FunctionNode = { type: string; async?: boolean | null; body: unknown };

type NodeLike = { type: string };

type ReturnTarget = { read: () => unknown; write: (value: unknown) => void };

/** Whether a hook was unwrapped from its literal envelope, or rewritten as an awaited member access. */
type FlattenResult = 'unwrapped' | 'awaited' | null;

/**
 * Recast print options, kept in step with `print-options.ts`.
 *
 * @remarks
 * Recast ends reprinted lines with the host's line ending unless told otherwise, so the source's own
 * line ending is kept. The raw output indents rewritten lines with extra tabs; run your formatter afterwards.
 */
function printOptions(source: string) {
	return {
		quote: 'single',
		tabWidth: 2,
		useTabs: true,
		lineTerminator: source.includes('\r\n') ? '\r\n' : '\n',
	} as const;
}

const FUNCTION_TYPES = new Set([
	'ArrowFunctionExpression',
	'FunctionExpression',
	'FunctionDeclaration',
	'ObjectMethod',
]);

function isNode(value: unknown): value is NodeLike & Record<string, unknown> {
	return typeof value === 'object' && value !== null && typeof (value as NodeLike).type === 'string';
}

function isFunctionNode(value: unknown): value is FunctionNode {
	return isNode(value) && FUNCTION_TYPES.has(value.type);
}

function unwrapExpression(node: unknown): unknown {
	let current = node;
	while (
		isNode(current) &&
		(current.type === 'ParenthesizedExpression' ||
			current.type === 'TSAsExpression' ||
			current.type === 'TSSatisfiesExpression')
	) {
		current = current.expression;
	}
	return current;
}

function propertyKeyName(property: ObjectProperty | ObjectMethod): string | undefined {
	if (property.computed) return undefined;
	const key: unknown = property.key;
	if (!isNode(key)) return undefined;
	if (key.type === 'Identifier') return key.name as string;
	if (key.type === 'StringLiteral') return key.value as string;
	return undefined;
}

/** Returns the one property an envelope literal holds, or null when the literal is not a plain envelope. */
function readEnvelopeValue(node: unknown, key: string): unknown | null {
	const object = unwrapExpression(node);
	if (!isNode(object) || object.type !== 'ObjectExpression') return null;
	const properties = object.properties as Array<ObjectProperty | ObjectMethod>;
	if (properties.length !== 1) return null;
	const [property] = properties;
	if (property.type !== 'ObjectProperty' || propertyKeyName(property) !== key) return null;
	return property.value;
}

/** Collects the `return` statements of one function body, without entering nested functions. */
function collectReturns(j: JSCodeshift, fn: FunctionNode): ASTPath[] {
	const returns: ASTPath[] = [];
	j(fn.body as ASTNode)
		.find(j.ReturnStatement)
		.forEach((returnPath) => {
			let parent: ASTPath | null = returnPath.parent;
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
 * @returns `'unwrapped'` when every return was a plain envelope, `'awaited'` when at least one became
 * `(await expr).key`, and null when the function was left untouched because it is not `async`.
 */
function flattenHookFunction(j: JSCodeshift, fn: FunctionNode, key: string): FlattenResult {
	const targets: ReturnTarget[] = [];

	if (isNode(fn.body) && fn.body.type !== 'BlockStatement') {
		targets.push({
			read: () => fn.body,
			write: (value) => {
				fn.body = value;
			},
		});
	} else {
		for (const returnPath of collectReturns(j, fn)) {
			const statement = returnPath.node as { argument?: unknown };
			if (!statement.argument) continue;
			targets.push({
				read: () => statement.argument,
				write: (value) => {
					statement.argument = value;
				},
			});
		}
	}

	const plans = targets.map((target) => {
		const expression = target.read();
		return { target, expression, unwrapped: readEnvelopeValue(expression, key) };
	});
	const needsAwait = plans.some((plan) => plan.unwrapped === null);
	if (needsAwait && !fn.async) {
		return null;
	}

	for (const { target, expression, unwrapped } of plans) {
		if (unwrapped !== null) {
			target.write(unwrapped);
			continue;
		}
		target.write(j.memberExpression(j.awaitExpression(expression as never), j.identifier(key)));
	}
	return needsAwait ? 'awaited' : 'unwrapped';
}

/** Resolves the function a hook value stands for: an inline function, or a same-file declaration it names. */
function resolveHookFunction(j: JSCodeshift, root: Collection, value: unknown): FunctionNode | null {
	const target = unwrapExpression(value);
	if (isFunctionNode(target)) return target;
	if (!isNode(target) || target.type !== 'Identifier') return null;
	const name = target.name as string;

	let resolved: FunctionNode | null = null;
	root.find(j.FunctionDeclaration, { id: { name } }).forEach((path) => {
		const parentType = (path.parent.node as NodeLike).type;
		if (parentType === 'Program' || parentType === 'ExportNamedDeclaration') {
			resolved = path.node as FunctionNode;
		}
	});
	if (resolved) return resolved;

	root.find(j.VariableDeclarator, { id: { type: 'Identifier', name } }).forEach((path) => {
		const init = unwrapExpression(path.node.init);
		if (isFunctionNode(init)) resolved = init;
	});
	return resolved;
}

function renameKey(property: ObjectProperty | ObjectMethod, to: string): void {
	const mutable = property as unknown as { shorthand?: boolean; value?: unknown; key: NodeLike & { name?: string } };
	if (mutable.shorthand) {
		mutable.shorthand = false;
		mutable.value = mutable.key;
		mutable.key = { type: 'Identifier', name: to };
		return;
	}
	if (mutable.key.type === 'StringLiteral') {
		mutable.key = { type: 'Identifier', name: to };
		return;
	}
	mutable.key.name = to;
}

function isEcoPageCall(node: { callee: unknown }): boolean {
	const callee = node.callee;
	if (!isNode(callee) || callee.type !== 'MemberExpression') return false;
	const { object, property } = callee;
	return (
		isNode(object) &&
		object.type === 'Identifier' &&
		object.name === 'eco' &&
		isNode(property) &&
		property.type === 'Identifier' &&
		property.name === 'page'
	);
}

export default function transform(file: FileInfo, api: API, _options: Options): string | null {
	const j = api.jscodeshift;
	const root = j(file.source);
	let changed = false;
	const skipped: string[] = [];
	const awaited: string[] = [];

	root.find(j.CallExpression)
		.filter((path) => isEcoPageCall(path.node))
		.forEach((path) => {
			const [argument] = path.node.arguments;
			if (!isNode(argument) || argument.type !== 'ObjectExpression') return;
			const properties = argument.properties as Array<ObjectProperty | ObjectMethod>;

			for (const { from, to } of HOOKS) {
				const property = properties.find(
					(candidate) =>
						(candidate.type === 'ObjectProperty' || candidate.type === 'ObjectMethod') &&
						propertyKeyName(candidate) === from,
				);
				if (!property) continue;

				const fn =
					property.type === 'ObjectMethod'
						? (property as FunctionNode)
						: resolveHookFunction(j, root, (property as ObjectProperty).value);
				const result = fn ? flattenHookFunction(j, fn, to) : null;

				if (result === null) {
					skipped.push(`${from} in ${file.path}`);
					continue;
				}
				if (result === 'awaited') {
					awaited.push(`${from} in ${file.path}`);
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
				if (specifier.type !== 'ImportSpecifier') continue;
				const importedName = String(specifier.imported.name);
				if (importedName in TYPE_RENAMES) {
					ecopagesTypeNames.add(importedName);
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
	for (const entry of awaited) {
		api.report(
			`migrate-data-hooks: ${entry} returns a value this codemod could not unwrap from a literal, so it now reads (await value).props or (await value).paths. Move the unwrap into the helper that builds the value if you want the hook to return it directly.`,
		);
	}

	return changed ? root.toSource(printOptions(file.source)) : null;
}
