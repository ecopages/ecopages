/**
 * Codemod: migrate-data-hooks
 *
 * Renames the `eco.page()` data hooks and drops their envelopes.
 *
 * Before:
 *   eco.page({
 *     staticPaths: async () => ({ paths: [{ params: { slug: 'a' } }] }),
 *     staticProps: async ({ pathname: { params } }) => ({ props: { title: params.slug } }),
 *     render: ...
 *   })
 *
 * After:
 *   eco.page({
 *     paths: async () => [{ params: { slug: 'a' } }],
 *     props: async ({ params }) => ({ title: params.slug }),
 *     render: ...
 *   })
 *
 * A hook is rewritten only when every value it returns can be unwrapped: an object literal holding just the
 * envelope key, or any expression inside an `async` function, which becomes `(await expr).props`. A hook it
 * cannot rewrite is left unchanged and reported, so the old name still fails loudly with a pointer to the migration docs.
 * The `GetStaticProps`, `GetStaticPaths` and `StaticPath` types are renamed to `GetProps`, `GetPaths` and `PagePath`.
 *
 * The props context passes `params` where it passed `pathname: { params }`, so in the `props` hook the first
 * parameter is rewritten when it is destructured as `{ pathname: { params } }` or `{ pathname }`, or is a
 * plain identifier read as `ctx.pathname.params`. A hook that reads `pathname` any other way, or declares a
 * `params` binding already, keeps its `pathname` and is reported.
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
	StaticPath: 'PagePath',
};

/**
 * The function node types a hook can be written as.
 *
 * @remarks
 * Node shapes are read through the narrow structural types below instead of the full `ast-types` unions,
 * because the Babel `tsx` parser yields node types (`ObjectProperty`, `ObjectMethod`, `TSSatisfiesExpression`)
 * that the exported unions do not all list.
 */
type FunctionNode = { type: string; async?: boolean | null; body: unknown; params?: unknown[] };

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

function hasPathnameTypeMember(value: unknown): boolean {
	if (Array.isArray(value)) return value.some(hasPathnameTypeMember);
	if (!isNode(value)) return false;
	if (value.type === 'TSPropertySignature') {
		const key = value.key;
		if (isNode(key) && key.name === 'pathname') return true;
	}
	return Object.values(value).some(hasPathnameTypeMember);
}

/**
 * Whether a node is a read of `name`, as opposed to a property name or object key that merely spells it.
 */
function isBindingReference(path: ASTPath): boolean {
	const parent = path.parent?.node as Record<string, unknown> | undefined;
	if (!parent || !isNode(parent)) return true;
	if (
		(parent.type === 'MemberExpression' || parent.type === 'OptionalMemberExpression') &&
		parent.property === path.node &&
		!parent.computed
	) {
		return false;
	}
	if (parent.type === 'ObjectProperty' && parent.key === path.node && !parent.computed && !parent.shorthand) {
		return false;
	}
	return true;
}

type PathnameRewrite = 'rewritten' | 'unchanged' | 'unsafe';

type PatternProperty = Record<string, unknown> & NodeLike;

function hasIdentifier(j: JSCodeshift, node: unknown, name: string): boolean {
	return j(node as ASTNode).find(j.Identifier, { name }).length > 0;
}

/** Whether a function already uses `params` as a binding, in its parameters or as a read in its body. */
function usesParamsBinding(j: JSCodeshift, fn: FunctionNode): boolean {
	const inParams = (fn.params ?? []).some((param) => hasIdentifier(j, param, 'params'));
	const inBody = j(fn.body as ASTNode)
		.find(j.Identifier, { name: 'params' })
		.some((path) => isBindingReference(path));
	return inParams || inBody;
}

function isMemberNamed(node: unknown, name: string): boolean {
	const member = node as Record<string, unknown>;
	return (
		isNode(member) &&
		member.type === 'MemberExpression' &&
		!member.computed &&
		isNode(member.property) &&
		member.property.name === name
	);
}

/** Whether a nested function or declaration in the body binds `name` again, so reads of it are not the parameter's. */
function rebindsName(j: JSCodeshift, fn: FunctionNode, name: string): boolean {
	const body = j(fn.body as ASTNode);
	const inFunctions = body
		.find(j.Function)
		.some((path) => (path.node.params as unknown[]).some((param) => hasIdentifier(j, param, name)));
	const inDeclarations = body.find(j.VariableDeclarator).some((path) => hasIdentifier(j, path.node.id, name));
	return inFunctions || inDeclarations;
}

/**
 * Replaces the node at `path` inside `fn.body` with `node`.
 *
 * @remarks
 * An expression body that is the read itself (`async ({ pathname }) => pathname.params` once unwrapped) is the
 * root of `j(fn.body)`, whose path has no parent to replace it in, so the body is reassigned instead.
 */
function replaceInBody(j: JSCodeshift, fn: FunctionNode, path: ASTPath, node: ASTNode): void {
	if (path.node === fn.body) {
		fn.body = node as never;
		return;
	}
	j(path).replaceWith(node);
}

const CONTEXT_FIELDS = new Set(['pathname', 'appConfig', 'runtimeOrigin']);

/**
 * Rewrites `ctx.pathname.params` reads to `ctx.params`, only when `ctx` is read as nothing but a plain member
 * of the context (`pathname`, `appConfig` or `runtimeOrigin`), with `ctx.pathname` always followed by `.params`.
 */
function rewriteContextIdentifier(j: JSCodeshift, fn: FunctionNode, local: string): PathnameRewrite {
	if (rebindsName(j, fn, local)) return 'unsafe';
	const accesses: ASTPath[] = [];
	let safe = true;
	j(fn.body as ASTNode)
		.find(j.Identifier, { name: local })
		.forEach((path) => {
			if (!isBindingReference(path)) return;
			const parent = path.parent.node as Record<string, unknown>;
			const field = isNode(parent.property) ? (parent.property.name as string) : '';
			if (parent.object !== path.node || parent.computed || !CONTEXT_FIELDS.has(field)) {
				safe = false;
				return;
			}
			if (field !== 'pathname') return;
			const grand = path.parent.parent?.node as Record<string, unknown> | undefined;
			if (grand?.object === parent && isMemberNamed(grand, 'params')) {
				accesses.push(path.parent.parent);
				return;
			}
			safe = false;
		});
	if (!safe) return 'unsafe';
	if (accesses.length === 0) return 'unchanged';
	for (const access of accesses) {
		replaceInBody(j, fn, access, j.memberExpression(j.identifier(local), j.identifier('params')));
	}
	return 'rewritten';
}

/** Rewrites a `pathname` binding named `local` and read as `local.params` into a plain `params` read. */
function flattenPathnameReads(j: JSCodeshift, fn: FunctionNode, local: string): boolean {
	const reads: ASTPath[] = [];
	let safe = true;
	j(fn.body as ASTNode)
		.find(j.Identifier, { name: local })
		.forEach((path) => {
			if (!isBindingReference(path)) return;
			const parent = path.parent.node as Record<string, unknown>;
			if (parent.object === path.node && isMemberNamed(parent, 'params')) {
				reads.push(path.parent);
				return;
			}
			safe = false;
		});
	if (!safe) return false;
	for (const read of reads) {
		replaceInBody(j, fn, read, j.identifier('params'));
	}
	return true;
}

/** Replaces `pathname: local` with `params` when every read of `local` is `local.params`. */
function rewriteBoundPathname(
	j: JSCodeshift,
	fn: FunctionNode,
	properties: PatternProperty[],
	index: number,
	paramsTaken: boolean,
): PathnameRewrite {
	const local = (properties[index].value as { name: string }).name;
	if (paramsTaken || usesParamsBinding(j, fn) || rebindsName(j, fn, local) || !flattenPathnameReads(j, fn, local)) {
		return 'unsafe';
	}
	const replacement = j.objectProperty(j.identifier('params'), j.identifier('params'));
	replacement.shorthand = true;
	properties[index] = replacement as never;
	return 'rewritten';
}

/** Rewrites the `pathname` entry of a destructured context parameter, at `index` of `properties`. */
function rewriteContextPattern(
	j: JSCodeshift,
	fn: FunctionNode,
	properties: PatternProperty[],
	index: number,
): PathnameRewrite {
	const value = properties[index].value;
	const paramsTaken = properties.some((property, at) => at !== index && hasIdentifier(j, property, 'params'));

	if (isNode(value) && value.type === 'ObjectPattern') {
		const inner = value.properties as PatternProperty[];
		const [only] = inner;
		const isParams =
			only?.type === 'ObjectProperty' && !only.computed && isNode(only.key) && only.key.name === 'params';
		if (inner.length !== 1 || !isParams || paramsTaken) return 'unsafe';
		properties[index] = only;
		return 'rewritten';
	}

	if (isNode(value) && value.type === 'Identifier') {
		return rewriteBoundPathname(j, fn, properties, index, paramsTaken);
	}
	return 'unsafe';
}

/**
 * Rewrites the context parameter of a `props` hook from `pathname: { params }` to `params`.
 *
 * @returns `'rewritten'`, `'unchanged'` when the hook never reads `pathname`, or `'unsafe'` when it reads it in a
 * way that cannot be rewritten and was left as written.
 */
function rewritePathnameContext(j: JSCodeshift, fn: FunctionNode): PathnameRewrite {
	const [first] = fn.params ?? [];
	if (!isNode(first)) return 'unchanged';
	if (hasPathnameTypeMember(first.typeAnnotation)) return 'unsafe';
	if (first.type === 'AssignmentPattern') {
		const left = first.left;
		return isNode(left) && (left.type === 'Identifier' || hasIdentifier(j, left, 'pathname'))
			? 'unsafe'
			: 'unchanged';
	}
	if (first.type === 'Identifier') return rewriteContextIdentifier(j, fn, first.name as string);
	if (first.type !== 'ObjectPattern') return 'unchanged';

	const properties = first.properties as PatternProperty[];
	const index = properties.findIndex(
		(property) =>
			property.type === 'ObjectProperty' &&
			!property.computed &&
			isNode(property.key) &&
			(property.key.name === 'pathname' || property.key.value === 'pathname'),
	);
	return index === -1 ? 'unchanged' : rewriteContextPattern(j, fn, properties, index);
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
	const pathnameSkipped: string[] = [];

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
				if (to === 'props' && fn && rewritePathnameContext(j, fn) === 'unsafe') {
					pathnameSkipped.push(`${from} in ${file.path}`);
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

	for (const entry of pathnameSkipped) {
		api.report(
			`migrate-data-hooks: ${entry} reads pathname in a way this codemod cannot rewrite. The props context passes params where it passed pathname.params, so change pathname.params to params by hand.`,
		);
	}

	return changed ? root.toSource(printOptions(file.source)) : null;
}
