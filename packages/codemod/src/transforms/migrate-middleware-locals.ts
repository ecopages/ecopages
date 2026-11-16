/**
 * Codemod: migrate-middleware-locals
 *
 * Moves `ctx.locals.x = value` assignments of an annotated middleware into the `next({ ... })` call of a
 * `createMiddleware` stage.
 *
 * Before:
 *   export const auth: FileRouteMiddleware = async (ctx, next) => {
 *     const session = await getSession(ctx.request);
 *     if (!session) return Response.redirect('/login');
 *     ctx.locals.session = session;
 *     return next();
 *   };
 *
 * After:
 *   export const auth = createMiddleware(async (ctx, next) => {
 *     const session = await getSession(ctx.request);
 *     if (!session) return Response.redirect('/login');
 *     return next({ session });
 *   });
 *
 * Only a declaration annotated `FileRouteMiddleware` or `Middleware` (imported from `@ecopages/core`) is rewritten, and only
 * when its assignments are top-level statements before the single `return next()` of the body, and the body uses `ctx`
 * only to read its fields other than `ctx.locals`, `ctx.query`, `ctx.render` and `ctx.renderPartial`. Code that receives
 * `ctx` itself could read a local that `next()` now provides later, so it blocks the move. A value that could read
 * differently by the time `next()` runs (anything but a literal or a `const` declared before it) is bound to a new `const`
 * where the assignment was, so it is evaluated in the same order. Anything else is left unchanged and reported with its
 * file and line, as is every `EcoMiddleware<Context>` annotation (the removed context-extension form).
 *
 * `render` no longer receives `locals` and `requires` is removed, so an `eco.page()` whose `render` reads them moves the
 * read into `props`:
 *
 * Before:
 *   eco.page({ cache: 'dynamic', requires: ['session'], render: ({ locals }) => <p>{locals.session.user}</p> });
 *
 * After:
 *   eco.page({ cache: 'dynamic', props: ({ locals }) => ({ sessionUser: locals.session.user }), render: ({ sessionUser }) => <p>{sessionUser}</p> });
 *
 * What `props` returns reaches the browser, so each member chain `render` reads becomes one prop named after its segments
 * and holding only that value, never the object it was read from. Only a literal `cache: 'dynamic'` page without `props`
 * is rewritten, when `render` destructures `locals` without a type annotation and reads it only as member chains used as
 * values (not called, indexed, spread, written or destructured), no chain starts with `params` or `query` (render
 * receives those from the route, after the props), and no prop name clashes with another or with a name in `render`.
 * Any other page that declares `requires` or reads `locals` in `render` is left unchanged and reported.
 *
 * The global `RequestLocals` interface is removed, so a `declare module '@ecopages/core'` block that augments it is
 * reported and left in place: deleting it is only safe once the middleware types each local it declared.
 *
 * @remarks
 * This file is deliberately self-contained, with no import beyond `jscodeshift` types and Node built-ins, because
 * `@ecopages/codemod` is not published: users run it from its raw GitHub URL with `npx jscodeshift`. Transforms
 * run in worker processes, so reports are appended as JSON lines to the file named by `ECOPAGES_CODEMOD_REPORT` when
 * it is set; the CLI reads that file once jscodeshift exits and prints the migration brief.
 *
 * A `createMiddleware` stage is typed with the page context, so an API `Middleware` that reads `ctx.query`, `ctx.render`
 * or `ctx.renderPartial` is reported instead of rewritten: a union context would make every stage narrow before reading
 * a field, and an intersection would type fields a page stage never receives.
 */

import { appendFileSync } from 'node:fs';
import type { API, ASTNode, ASTPath, FileInfo, JSCodeshift, Options, VariableDeclarator } from 'jscodeshift';

export const parser = 'tsx';

/** The environment variable naming the file a run appends its reports to. */
export const REPORT_ENV = 'ECOPAGES_CODEMOD_REPORT';

/** A case the codemod could not migrate, which a person or agent has to finish. */
export type MiddlewareReport = {
	kind: 'eco-middleware' | 'locals-assignment' | 'page-requires' | 'request-locals-augmentation';
	file: string;
	line: number;
	reason: string;
};

type NodeLike = { type: string } & Record<string, unknown>;

const CORE = '@ecopages/core';
const OLD_TYPES = new Set(['FileRouteMiddleware', 'Middleware']);
const FUNCTION_TYPES = new Set(['ArrowFunctionExpression', 'FunctionExpression']);

function printOptions(source: string) {
	return {
		quote: 'single',
		tabWidth: 2,
		useTabs: true,
		lineTerminator: source.includes('\r\n') ? '\r\n' : '\n',
	} as const;
}

function isNode(value: unknown): value is NodeLike {
	return typeof value === 'object' && value !== null && typeof (value as NodeLike).type === 'string';
}

function lineOf(node: unknown): number {
	const loc = isNode(node) ? (node.loc as { start?: { line?: number } } | null | undefined) : undefined;
	return loc?.start?.line ?? 0;
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

/** Reads the identifier name an annotation `TSTypeReference` points at, or null for any other type. */
function annotationName(id: unknown): string | null {
	if (!isNode(id) || !isNode(id.typeAnnotation)) return null;
	const type = (id.typeAnnotation as NodeLike).typeAnnotation;
	if (!isNode(type) || type.type !== 'TSTypeReference' || !isNode(type.typeName)) return null;
	return type.typeName.type === 'Identifier' ? (type.typeName.name as string) : null;
}

/** Names imported from `@ecopages/core`, mapped by their local name to the imported one. */
function coreImports(j: JSCodeshift, root: ReturnType<JSCodeshift>): Map<string, string> {
	const names = new Map<string, string>();
	root.find(j.ImportDeclaration, { source: { value: CORE } }).forEach((path) => {
		for (const specifier of path.node.specifiers ?? []) {
			if (specifier.type !== 'ImportSpecifier') continue;
			names.set(specifier.local?.name ?? String(specifier.imported.name), String(specifier.imported.name));
		}
	});
	return names;
}

/** Reads `ctx.locals.key` as `[key]` when `node` is such a member on the identifier `ctx`. */
function localsKey(node: unknown, ctx: string): string | null {
	if (!isNode(node) || (node.type !== 'MemberExpression' && node.type !== 'OptionalMemberExpression')) return null;
	const inner = node.object;
	if (!isNode(inner) || inner.type !== 'MemberExpression' || inner.computed) return null;
	if (!isNode(inner.object) || inner.object.type !== 'Identifier' || inner.object.name !== ctx) return null;
	if (!isNode(inner.property) || inner.property.name !== 'locals') return null;
	if (node.computed || !isNode(node.property) || node.property.type !== 'Identifier') return null;
	return node.property.name as string;
}

function isLocalsAssignment(node: unknown, ctx: string): node is NodeLike & { left: NodeLike; right: NodeLike } {
	return (
		isNode(node) &&
		node.type === 'AssignmentExpression' &&
		node.operator === '=' &&
		localsKey(node.left, ctx) !== null
	);
}

/**
 * A moved assignment: the statement it was, its key and its value.
 *
 * @remarks
 * `hoistAs` names the `const` the value is bound to where the assignment was; `evaluate` keeps the value as a bare
 * statement there, for a value a later assignment of the same key overwrites but whose evaluation may have effects.
 * With neither, the statement is removed and `next()` passes the value itself.
 */
type Move = { statement: NodeLike; key: string; value: NodeLike; hoistAs: string | null; evaluate: boolean };

type Plan = { moves: Move[]; nextReturn: ASTPath };

/** Context fields an API stage receives that a `createMiddleware` stage, typed with the page context, does not. */
const API_ONLY_FIELDS = new Set(['query', 'render', 'renderPartial']);

const LITERAL_TYPES = new Set(['StringLiteral', 'NumericLiteral', 'BooleanLiteral', 'NullLiteral', 'BigIntLiteral']);

const REASONS = {
	apiField:
		'reads ctx.query, ctx.render or ctx.renderPartial, which a createMiddleware stage does not receive: it is typed with the page context',
	wholeContext:
		'uses ctx other than by reading one of its fields (it passes, aliases or destructures it), so code before next() could look for a local that next() would now provide later',
	readsLocals: 'reads ctx.locals before next()',
} as const;

function isMemberNode(node: NodeLike): boolean {
	return node.type === 'MemberExpression' || node.type === 'OptionalMemberExpression';
}

/** Whether an identifier is only a name here: a non-computed member property or a non-shorthand object key. */
function isNameOnly(path: ASTPath): boolean {
	const parent = path.parent.node as NodeLike;
	if (isMemberNode(parent) && parent.property === path.node) return !parent.computed;
	const isKey = (parent.type === 'ObjectProperty' || parent.type === 'ObjectMethod') && parent.key === path.node;
	return isKey && !parent.computed && !parent.shorthand;
}

/** The names a function references, which a new binding inside it must not take. */
function referencedNames(j: JSCodeshift, fn: NodeLike): Set<string> {
	const names = j(fn as unknown as ASTNode)
		.find(j.Identifier)
		.filter((path) => !isNameOnly(path))
		.nodes()
		.map((node) => node.name);
	return new Set(names);
}

/**
 * Why one reference to `ctx` blocks the move, or null when it is a field read the move cannot affect.
 *
 * @remarks
 * Only `ctx.field` reads are allowed, and `ctx.locals` only as the target of a moved assignment: any other use can
 * reach `ctx.locals` (a helper given `ctx`, a destructured `locals`) and would no longer see the moved keys.
 */
function ctxUseReason(path: ASTPath, targets: ReadonlySet<unknown>): string | null {
	const parent = path.parent.node as NodeLike;
	const isFieldRead =
		isMemberNode(parent) &&
		parent.object === path.node &&
		!parent.computed &&
		isNode(parent.property) &&
		parent.property.type === 'Identifier';
	if (!isFieldRead) return REASONS.wholeContext;
	const field = (parent.property as NodeLike).name as string;
	if (API_ONLY_FIELDS.has(field)) return REASONS.apiField;
	if (field !== 'locals') return null;
	return targets.has(path.parent.parent.node) ? null : REASONS.readsLocals;
}

function blockingCtxUse(j: JSCodeshift, body: NodeLike, ctx: string, assignments: ASTPath[]): string | null {
	const targets = new Set(assignments.map((path) => (path.node as { left: unknown }).left));
	const reasons = new Set(
		j(body as unknown as ASTNode)
			.find(j.Identifier, { name: ctx })
			.filter((path) => !isNameOnly(path))
			.paths()
			.map((path) => ctxUseReason(path, targets))
			.filter((reason) => reason !== null),
	);
	return [REASONS.apiField, REASONS.wholeContext, REASONS.readsLocals].find((reason) => reasons.has(reason)) ?? null;
}

/** The single top-level `return next()` call of the body, or a reason there is none. */
function findNextReturn(j: JSCodeshift, body: NodeLike, statements: NodeLike[], next: string): ASTPath | string {
	const calls = j(body as unknown as ASTNode)
		.find(j.CallExpression, { callee: { type: 'Identifier', name: next } })
		.paths();
	if (calls.length !== 1) return 'calls next() from several places';
	const [call] = calls;
	const returnNode = (call.parent as ASTPath).node as NodeLike;
	if (returnNode.type !== 'ReturnStatement' || !statements.includes(returnNode)) {
		return 'does not end with a top-level return next()';
	}
	if ((call.node.arguments as unknown[]).length > 0) return 'already passes values to next()';
	return call;
}

/** Names bound by a top-level `const name = ...` before `index`, whose value cannot change before `next()`. */
function constNamesBefore(statements: NodeLike[], index: number): Set<string> {
	const names = new Set<string>();
	for (const statement of statements.slice(0, index)) {
		if (statement.type !== 'VariableDeclaration' || statement.kind !== 'const') continue;
		for (const declarator of statement.declarations as NodeLike[]) {
			if (isNode(declarator.id) && declarator.id.type === 'Identifier') names.add(declarator.id.name as string);
		}
	}
	return names;
}

/** Whether a value reads the same at the `next()` call as at its assignment: a literal or a `const` from before. */
function isStableValue(value: NodeLike, constNames: ReadonlySet<string>): boolean {
	if (LITERAL_TYPES.has(value.type)) return true;
	if (value.type === 'TemplateLiteral') return (value.expressions as unknown[]).length === 0;
	return value.type === 'Identifier' && constNames.has(value.name as string);
}

function freshName(key: string, taken: Set<string>): string {
	let name = key;
	for (let suffix = 2; taken.has(name); suffix++) name = `${key}${suffix}`;
	taken.add(name);
	return name;
}

/**
 * Plans each moved value.
 *
 * @remarks
 * A value that could read differently at `next()`, or whose evaluation has effects, is bound to a new `const` where
 * the assignment was, so it is evaluated in the same order and `next()` passes that binding.
 */
function planMoves(j: JSCodeshift, fn: NodeLike, statements: NodeLike[], ctx: string, assignments: ASTPath[]): Move[] {
	const taken = referencedNames(j, fn);
	const keys = assignments.map((path) => localsKey((path.node as { left: unknown }).left, ctx) as string);
	return assignments.map((path, index) => {
		const value = (path.node as unknown as { right: NodeLike }).right;
		const statement = path.parent.node as NodeLike;
		const key = keys[index];
		const stable = isStableValue(value, constNamesBefore(statements, statements.indexOf(statement)));
		if (keys.lastIndexOf(key) !== index) return { statement, key, value, hoistAs: null, evaluate: !stable };
		return { statement, key, value, hoistAs: stable ? null : freshName(key, taken), evaluate: false };
	});
}

/**
 * Decides whether a middleware's assignments can move into its `next()` call.
 *
 * @returns The moves and the `return next()` to rewrite, or a reason the function must stay as written.
 */
function planMove(
	j: JSCodeshift,
	fn: NodeLike,
	ctx: string,
	next: string | null,
	assignments: ASTPath[],
): Plan | string {
	const body = fn.body as NodeLike & { body: NodeLike[] };
	const statements = body.body;
	const topLevel = assignments.filter((path) => {
		const parent = path.parent.node as NodeLike;
		return parent.type === 'ExpressionStatement' && statements.includes(parent);
	});
	if (topLevel.length !== assignments.length) {
		return 'assigns ctx.locals inside a branch, loop or nested function';
	}
	if (!next) return 'has no next parameter to pass the locals to';

	const call = findNextReturn(j, body, statements, next);
	if (typeof call === 'string') return call;
	const returnIndex = statements.indexOf((call.parent as ASTPath).node as NodeLike);
	const moved = topLevel.map((path) => statements.indexOf(path.parent.node as NodeLike));
	if (moved.some((index) => index > returnIndex)) return 'assigns ctx.locals after the next() call';

	const blocked = blockingCtxUse(j, body, ctx, topLevel);
	if (blocked) return blocked;

	return { moves: planMoves(j, fn, statements, ctx, topLevel), nextReturn: call };
}

function buildLocalsObject(j: JSCodeshift, moves: Move[]) {
	const values = new Map<string, NodeLike>();
	for (const move of moves) {
		values.delete(move.key);
		values.set(move.key, move.hoistAs ? (j.identifier(move.hoistAs) as unknown as NodeLike) : move.value);
	}
	const properties = [...values].map(([key, value]) => {
		const property = j.objectProperty(
			j.identifier(key),
			value as unknown as Parameters<typeof j.objectProperty>[1],
		);
		property.shorthand = value.type === 'Identifier' && value.name === key;
		return property;
	});
	return j.objectExpression(properties);
}

/** Replaces each moved assignment with its `const` binding, or removes it when `next()` passes the value itself. */
function applyMoves(j: JSCodeshift, body: unknown[], moves: Move[]): void {
	for (const move of moves) {
		const value = move.value as unknown as Parameters<typeof j.variableDeclarator>[1];
		const replacement = move.hoistAs
			? [j.variableDeclaration('const', [j.variableDeclarator(j.identifier(move.hoistAs), value)])]
			: move.evaluate
				? [j.expressionStatement(value as Parameters<typeof j.expressionStatement>[0])]
				: [];
		body.splice(body.indexOf(move.statement), 1, ...replacement);
	}
}

/** Whether `name` is still read anywhere in the file outside import specifiers. */
function stillUsed(j: JSCodeshift, root: ReturnType<JSCodeshift>, name: string): boolean {
	return (
		root.find(j.Identifier, { name }).filter((path) => {
			const parent = path.parent.node as NodeLike;
			return parent.type !== 'ImportSpecifier' && parent.type !== 'ImportDefaultSpecifier';
		}).length > 0
	);
}

function dropUnusedCoreTypes(j: JSCodeshift, root: ReturnType<JSCodeshift>): void {
	root.find(j.ImportDeclaration, { source: { value: CORE } }).forEach((path) => {
		const specifiers = path.node.specifiers ?? [];
		const kept = specifiers.filter(
			(specifier) =>
				specifier.type !== 'ImportSpecifier' ||
				!OLD_TYPES.has(String(specifier.imported.name)) ||
				stillUsed(j, root, specifier.local?.name ?? String(specifier.imported.name)),
		);
		if (kept.length === specifiers.length) return;
		if (kept.length === 0) {
			j(path).remove();
			return;
		}
		path.node.specifiers = kept;
	});
}

function addCreateMiddlewareImport(j: JSCodeshift, root: ReturnType<JSCodeshift>): void {
	const imports = root.find(j.ImportDeclaration, { source: { value: CORE } });
	const valueImport = imports.filter((path) => path.node.importKind !== 'type');
	const specifier = j.importSpecifier(j.identifier('createMiddleware'));
	if (valueImport.length > 0) {
		const target = valueImport.paths()[0].node;
		const present = (target.specifiers ?? []).some(
			(candidate) => candidate.type === 'ImportSpecifier' && candidate.imported.name === 'createMiddleware',
		);
		if (!present) target.specifiers = [...(target.specifiers ?? []), specifier];
		return;
	}
	const declaration = j.importDeclaration([specifier], j.literal(CORE));
	if (imports.length > 0) {
		j(imports.paths()[0]).insertAfter(declaration);
		return;
	}
	root.get().node.program.body.unshift(declaration);
}

type PageOptions = { argument: NodeLike & { properties: NodeLike[] } };

function pageOptions(call: ASTPath): PageOptions | null {
	const [argument] = call.node.arguments as unknown[];
	if (!isNode(argument) || argument.type !== 'ObjectExpression') return null;
	return { argument: argument as PageOptions['argument'] };
}

function pageProperty(options: PageOptions, name: string): NodeLike | undefined {
	return options.argument.properties.find(
		(property) =>
			(property.type === 'ObjectProperty' || property.type === 'ObjectMethod') &&
			!property.computed &&
			isNode(property.key) &&
			property.key.name === name,
	);
}

/** The function node of a `render` option, written as a method or as a function value. */
function renderFunction(render: NodeLike | undefined): NodeLike | null {
	if (!render) return null;
	if (render.type === 'ObjectMethod') return render;
	const value = unwrapExpression(render.value);
	return isNode(value) && FUNCTION_TYPES.has(value.type) ? value : null;
}

function isLocalsShorthand(property: NodeLike): boolean {
	return (
		property.type === 'ObjectProperty' &&
		!property.computed &&
		isNode(property.key) &&
		property.key.name === 'locals' &&
		isNode(property.value) &&
		property.value.type === 'Identifier' &&
		property.value.name === 'locals'
	);
}

/** The `{ locals }` entry of an unannotated destructured first parameter, or null when there is none. */
function localsBinding(fn: NodeLike): { pattern: NodeLike & { properties: NodeLike[] }; entry: NodeLike } | null {
	const [first] = fn.params as NodeLike[];
	if (!first || first.type !== 'ObjectPattern' || first.typeAnnotation) return null;
	const properties = first.properties as NodeLike[];
	if (properties.some((property) => property.type === 'RestElement')) return null;
	const entry = properties.find(isLocalsShorthand);
	return entry ? { pattern: first as NodeLike & { properties: NodeLike[] }, entry } : null;
}

function isMemberRead(path: ASTPath): boolean {
	const parent = path.parent.node as NodeLike;
	return (
		isMemberNode(parent) &&
		parent.object === path.node &&
		!parent.computed &&
		isNode(parent.property) &&
		parent.property.type === 'Identifier'
	);
}

function isPropertyName(path: ASTPath): boolean {
	const parent = path.parent.node as NodeLike;
	return isMemberNode(parent) && parent.property === path.node && !parent.computed;
}

/** Keys `render` receives from the route after the props, which a prop of the same name would never reach. */
const ROUTE_KEYS = new Set(['params', 'query', 'locals']);

/** One `locals.a.b` read of `render`: the outermost member and the prop it becomes. */
type LocalsRead = { path: ASTPath; chain: string; name: string; first: string };

/**
 * Whether the outermost member of a `locals` chain is read as a value, and not called, indexed, spread, written or
 * destructured.
 *
 * @remarks
 * Each of those needs more than the value of the chain (a call needs its receiver, a spread or destructuring reads
 * every key), so the prop would carry more than `render` uses.
 */
function isValueRead(top: ASTPath): boolean {
	const parent = top.parent.node as NodeLike;
	const rule = VALUE_READ_RULES[parent.type];
	return rule ? rule(parent, top.node) : true;
}

const notOperand = (field: string) => (parent: NodeLike, node: unknown) => parent[field] !== node;
const notObjectOrTarget = (parent: NodeLike, node: unknown) => parent.object !== node && parent.left !== node;
const never = () => false;

/** How each parent of a chain's outermost member decides whether the chain is read as a value; others always do. */
const VALUE_READ_RULES: Record<string, (parent: NodeLike, node: unknown) => boolean> = {
	CallExpression: notOperand('callee'),
	OptionalCallExpression: notOperand('callee'),
	NewExpression: notOperand('callee'),
	TaggedTemplateExpression: notOperand('tag'),
	MemberExpression: notObjectOrTarget,
	OptionalMemberExpression: notObjectOrTarget,
	AssignmentExpression: notObjectOrTarget,
	ForOfStatement: notObjectOrTarget,
	ForInStatement: notObjectOrTarget,
	VariableDeclarator: (parent) => isNode(parent.id) && parent.id.type === 'Identifier',
	UnaryExpression: (parent) => parent.operator !== 'delete',
	UpdateExpression: never,
	SpreadElement: never,
	JSXSpreadAttribute: never,
	TSNonNullExpression: never,
	ParenthesizedExpression: never,
};

/** Reads the member chain that starts at one `locals` reference, or null when it is not a value read. */
function readChain(reference: ASTPath): LocalsRead | null {
	const segments: string[] = [];
	let chain = '';
	let current = reference;
	while (isMemberRead(current)) {
		current = current.parent as ASTPath;
		const member = current.node as unknown as NodeLike;
		const name = (member.property as NodeLike).name as string;
		segments.push(name);
		chain += `${member.optional ? '?.' : '.'}${name}`;
	}
	if (segments.length === 0 || !isValueRead(current)) return null;
	const name = segments
		.map((segment, index) => (index === 0 ? segment : `${segment[0].toUpperCase()}${segment.slice(1)}`))
		.join('');
	return { path: current, chain, name, first: segments[0] };
}

/**
 * The `locals` reads of `render`, or a reason they cannot become props.
 *
 * @remarks
 * The identifiers of the `{ locals }` entry itself are skipped. Every other reference must start a member chain
 * read as a value; each distinct chain becomes one prop named after its segments, so the prop holds exactly what
 * `render` read and never the object it was read from.
 */
function localsReads(j: JSCodeshift, fn: NodeLike, entry: NodeLike): LocalsRead[] | string | null {
	const references = j(fn as unknown as ASTNode)
		.find(j.Identifier, { name: 'locals' })
		.filter((path) => path.parent.node !== entry)
		.paths();
	if (references.length === 0) return null;
	const reads = references.map(readChain);
	if (reads.some((read) => read === null)) {
		return 'reads locals other than as the value of a member chain (it passes, calls, indexes, spreads, writes or destructures it)';
	}
	return reads.filter((read) => read !== null);
}

/** Why the props named after these reads would not reach `render` as written, or null when they would. */
function readNamesConflict(j: JSCodeshift, fn: NodeLike, reads: LocalsRead[]): string | null {
	if (reads.some((read) => ROUTE_KEYS.has(read.first) || ROUTE_KEYS.has(read.name))) {
		return 'reads locals.params, locals.query or locals.locals, which render receives from the route instead';
	}
	const chainsByName = new Map<string, Set<string>>();
	for (const read of reads) chainsByName.set(read.name, (chainsByName.get(read.name) ?? new Set()).add(read.chain));
	const clash = [...chainsByName].some(([name, chains]) => chains.size > 1 || nameInUse(j, fn, name));
	return clash ? 'reads locals under a name that another read or render already uses' : null;
}

/** Whether a name appears in `render` other than as a member property, so a new binding could shadow it. */
function nameInUse(j: JSCodeshift, fn: NodeLike, name: string): boolean {
	return (
		j(fn as unknown as ASTNode)
			.find(j.Identifier, { name })
			.filter((path) => !isPropertyName(path)).length > 0
	);
}

type PagePlan = {
	binding: NonNullable<ReturnType<typeof localsBinding>>;
	reads: LocalsRead[];
};

/**
 * Decides whether a page's `render` read of `locals` can move into a new `props` hook.
 *
 * @returns The plan, a reason it cannot move, or null when the page is not one this rewrite applies to.
 */
function planPage(j: JSCodeshift, options: PageOptions): PagePlan | string | null {
	const cache = pageProperty(options, 'cache');
	const isDynamic = isNode(cache?.value) && cache.value.type === 'StringLiteral' && cache.value.value === 'dynamic';
	if (!isDynamic || pageProperty(options, 'props')) return null;
	const fn = renderFunction(pageProperty(options, 'render'));
	const binding = fn ? localsBinding(fn) : null;
	if (!fn || !binding) return null;
	const reads = localsReads(j, fn, binding.entry);
	if (reads === null || typeof reads === 'string') return reads;
	return readNamesConflict(j, fn, reads) ?? { binding, reads };
}

function shorthand(j: JSCodeshift, name: string, value: Parameters<typeof j.objectProperty>[1]) {
	const property = j.objectProperty(j.identifier(name), value);
	property.shorthand = true;
	return property;
}

function applyPagePlan(j: JSCodeshift, options: PageOptions, plan: PagePlan): void {
	const { properties } = options.argument;
	const values = new Map<string, Parameters<typeof j.objectProperty>[1]>();
	for (const read of plan.reads) {
		if (!values.has(read.name)) values.set(read.name, read.path.node as Parameters<typeof j.objectProperty>[1]);
	}
	const returned = j.objectExpression(
		[...values].map(([name, value]) => j.objectProperty(j.identifier(name), value)),
	);
	const props = j.objectProperty(
		j.identifier('props'),
		j.arrowFunctionExpression([j.objectPattern([shorthand(j, 'locals', j.identifier('locals'))])], returned),
	);
	for (const read of plan.reads) {
		read.path.replace(j.identifier(read.name));
	}
	const patternProperties = plan.binding.pattern.properties;
	patternProperties.splice(
		patternProperties.indexOf(plan.binding.entry),
		1,
		...([...values.keys()].map((name) => shorthand(j, name, j.identifier(name))) as unknown as NodeLike[]),
	);
	const requires = pageProperty(options, 'requires');
	if (requires) properties.splice(properties.indexOf(requires), 1);
	const render = pageProperty(options, 'render') as NodeLike;
	properties.splice(properties.indexOf(render), 0, props as unknown as NodeLike);
}

/** The line of a page's `requires`, or of the first `locals` reference in its `render`, or null when neither exists. */
function pageLocalsLine(j: JSCodeshift, options: PageOptions): number | null {
	const requires = pageProperty(options, 'requires');
	if (requires) return lineOf(requires);
	const fn = renderFunction(pageProperty(options, 'render'));
	if (!fn) return null;
	const references = j(fn as unknown as ASTNode).find(j.Identifier, { name: 'locals' });
	return references.length > 0 ? lineOf(references.paths()[0].node) : null;
}

/**
 * Migrates one `eco.page()` call whose `render` reads `locals`, or reports it.
 *
 * @returns Whether the call was rewritten.
 */
function migratePage(j: JSCodeshift, call: ASTPath, filePath: string, reports: MiddlewareReport[]): boolean {
	const options = pageOptions(call);
	if (!options) return false;
	const plan = planPage(j, options);
	if (plan !== null && typeof plan !== 'string') {
		applyPagePlan(j, options, plan);
		return true;
	}
	const line = pageLocalsLine(j, options);
	if (line !== null) {
		const detail = plan ? `; not rewritten because render ${plan}` : '';
		reports.push({
			kind: 'page-requires',
			file: filePath,
			line,
			reason: `requires is removed and render no longer receives locals${detail}: read them in props and return only what render needs, never a whole session or user object`,
		});
	}
	return false;
}

function isEcoPageCall(node: { callee: unknown }): boolean {
	const callee = node.callee;
	return (
		isNode(callee) &&
		callee.type === 'MemberExpression' &&
		isNode(callee.object) &&
		callee.object.name === 'eco' &&
		isNode(callee.property) &&
		callee.property.name === 'page'
	);
}

/**
 * Reports each `interface RequestLocals` declared in a `declare module '@ecopages/core'` block.
 */
function reportRequestLocalsAugmentations(
	j: JSCodeshift,
	root: ReturnType<JSCodeshift>,
	filePath: string,
	reports: MiddlewareReport[],
): void {
	root.find(j.TSModuleDeclaration)
		.filter((path) => isNode(path.node.id) && path.node.id.value === CORE)
		.find(j.TSInterfaceDeclaration, { id: { name: 'RequestLocals' } })
		.forEach((path) => {
			reports.push({
				kind: 'request-locals-augmentation',
				file: filePath,
				line: lineOf(path.node),
				reason: 'the global RequestLocals interface is removed: provide each local with createMiddleware, annotate the locals a shared layout entry reads on its factory parameter, then delete this declaration',
			});
		});
}

function writeReports(reports: MiddlewareReport[]): void {
	const target = process.env[REPORT_ENV];
	if (!target || reports.length === 0) return;
	appendFileSync(target, reports.map((report) => `${JSON.stringify(report)}\n`).join(''));
}

/**
 * The middleware function of a declarator, with the names of its context and `next` parameters.
 *
 * @remarks
 * Returns `null` for anything that is not a block-bodied function whose first parameter is a plain identifier.
 */
function middlewareFunction(init: unknown): { fn: NodeLike; ctx: string; next: string | null } | null {
	const fn = unwrapExpression(init);
	if (!isNode(fn) || !FUNCTION_TYPES.has(fn.type) || !isNode(fn.body) || fn.body.type !== 'BlockStatement') {
		return null;
	}
	const [first, second] = fn.params as NodeLike[];
	if (!first || first.type !== 'Identifier') return null;
	return {
		fn,
		ctx: first.name as string,
		next: second && second.type === 'Identifier' ? (second.name as string) : null,
	};
}

/**
 * Migrates one annotated middleware declaration, or reports why it was left alone.
 *
 * @returns Whether the declaration was rewritten.
 */
function migrateDeclarator(
	j: JSCodeshift,
	path: ASTPath<VariableDeclarator>,
	filePath: string,
	imported: Map<string, string>,
	reports: MiddlewareReport[],
): boolean {
	const name = annotationName(path.node.id);
	if (!name || !imported.has(name)) return false;
	const original = imported.get(name);

	if (original === 'EcoMiddleware') {
		reports.push({
			kind: 'eco-middleware',
			file: filePath,
			line: lineOf(path.node),
			reason: 'EcoMiddleware<Context> is removed; pass the value with next({ field }) and read it from ctx.locals',
		});
		return false;
	}
	if (!original || !OLD_TYPES.has(original)) return false;

	const target = middlewareFunction(path.node.init);
	if (!target) return false;
	const { fn, ctx, next } = target;

	const assignments = j(fn as unknown as ASTNode)
		.find(j.AssignmentExpression)
		.filter((candidate) => isLocalsAssignment(candidate.node, ctx))
		.paths();
	if (assignments.length === 0) return false;

	const plan = planMove(j, fn, ctx, next, assignments);
	if (typeof plan === 'string') {
		for (const assignment of assignments) {
			reports.push({
				kind: 'locals-assignment',
				file: filePath,
				line: lineOf(assignment.node),
				reason: `ctx.locals assignment not moved: the middleware ${plan}`,
			});
		}
		return false;
	}

	(plan.nextReturn.node as { arguments: unknown[] }).arguments = [buildLocalsObject(j, plan.moves)];
	applyMoves(j, (fn.body as { body: unknown[] }).body, plan.moves);
	(path.node.id as { typeAnnotation?: unknown }).typeAnnotation = null;
	path.node.init = j.callExpression(j.identifier('createMiddleware'), [fn as never]);
	return true;
}

export default function transform(file: FileInfo, api: API, _options: Options): string | null {
	const j = api.jscodeshift;
	const root = j(file.source);
	const imported = coreImports(j, root);
	const reports: MiddlewareReport[] = [];
	let changed = false;

	root.find(j.VariableDeclarator).forEach((path) => {
		if (migrateDeclarator(j, path, file.path, imported, reports)) changed = true;
	});

	if (changed) {
		dropUnusedCoreTypes(j, root);
		addCreateMiddlewareImport(j, root);
	}

	root.find(j.CallExpression)
		.filter((path) => isEcoPageCall(path.node))
		.forEach((path) => {
			if (migratePage(j, path, file.path, reports)) changed = true;
		});

	reportRequestLocalsAugmentations(j, root, file.path, reports);

	for (const report of reports) {
		api.report(`migrate-middleware-locals: ${report.file}:${report.line} ${report.reason}`);
	}
	writeReports(reports);

	return changed ? root.toSource(printOptions(file.source)) : null;
}
