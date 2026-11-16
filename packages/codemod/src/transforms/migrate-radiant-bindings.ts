/**
 * Codemod: migrate-radiant-bindings
 *
 * Moves `@ecopages/radiant` code off the `$name` companion bindings and the `bind` option, which Radiant 0.10.0
 * removed, onto the host's binding namespace `this.$`.
 *
 * Before:
 *   class Counter extends RadiantElement {
 *     @prop({ type: Number, bind: true }) count = 0;
 *     @state label: string = 'Count';
 *     @attr({ source: 'data-step', type: Number, bind: 'stepBinding' }) step = 1;
 *     render() { return <p>{this.$label}: {this.$count} by {this.stepBinding}</p>; }
 *   }
 *
 * After:
 *   class Counter extends RadiantElement<{ count: number; label: string; step: number }> {
 *     @prop({ type: Number }) count = 0;
 *     @state label: string = 'Count';
 *     @attr({ source: 'data-step', type: Number }) step = 1;
 *     render() { return <p>{this.$.label}: {this.$.count} by {this.$.step}</p>; }
 *   }
 *
 * A reactive member is a field decorated with `@prop`, `@state`, `@attr` or `@signal` (as a decorator or as a
 * call on `Class.prototype`), or one created with `this.createReactiveProp` or `this.createReactiveField`. In
 * 0.9.0 it had a companion named `$name` when `bind` was `true`, or omitted on a class that extends
 * `RadiantElement`, `RadiantController` or `FormAssociatedElement`, and one named after the string when `bind`
 * was a string. A read of that companion on `this` becomes `this.$.name`, and the members it rewrote are added
 * to the type argument of `extends RadiantElement` or `extends RadiantController`, typed from the annotation or
 * a literal initializer. A `bind` that is `true`, `false` or a string literal is removed, with the options
 * object when it ends up empty and the parameter is optional.
 *
 * Anything it cannot rewrite safely is left unchanged and reported with its line: `ReactiveBindingOption`
 * imports, `defineReactiveBinding` and `shouldAutoBindReactiveMembers`, computed `this['$name']` access,
 * writes and destructuring of a companion, companion reads outside their class, a `bind` or options value it
 * cannot read, a member type it cannot tell, a read of a member that had no companion, and `$name` reads in a
 * class whose base is outside the file.
 *
 * @remarks
 * The transform splices the source text at the parsed node offsets instead of reprinting through Recast. Adding
 * a type argument changes the class node, and Recast then reprints the whole class body, which re-indents it
 * and drops whitespace in JSX text. Splicing keeps every untouched character, so the source's tabs or spaces,
 * line endings and JSX text stay as written.
 *
 * 0.9.0 defined the companion on the element's prototype, so every instance read the first instance's binding.
 * `this.$.name` reads the instance's own binding, which is the fix 0.10.0 makes; no other behaviour changes.
 */

import type { API, ASTPath, Collection, FileInfo, JSCodeshift, Options } from 'jscodeshift';

export const parser = 'tsx';

const TRANSFORM = 'migrate-radiant-bindings';

const RADIANT_SOURCE = /^@ecopages\/radiant(\/|$)/;

/** Base classes whose members had a companion when `bind` was omitted. */
const AUTO_BIND_BASES = new Set(['RadiantElement', 'RadiantController', 'FormAssociatedElement']);

/** Base classes that take the binding shape as their type argument. */
const GENERIC_BASES = new Set(['RadiantElement', 'RadiantController']);

/** Decorator factories whose first argument is the member options. */
const OPTION_FACTORIES = new Set(['prop', 'attr', 'signal']);

/** Decorators that also apply bare, as `@state` or `@signal`. */
const BARE_DECORATORS = new Set(['state', 'signal']);

/** Host methods that create a reactive member, with the index of their options argument. */
const MEMBER_HELPERS: Readonly<Record<string, number>> = { createReactiveProp: 1, createReactiveField: 2 };

/**
 * Callees whose options parameter is optional, so an options object left empty can be dropped.
 *
 * @remarks
 * `prop` and `createReactiveProp` require options with a `type`, so their object is kept.
 */
const OPTIONAL_OPTIONS = new Set(['attr', 'signal', 'createReactiveField']);

const REMOVED_HOST_METHODS = new Set(['defineReactiveBinding', 'shouldAutoBindReactiveMembers']);

const SIGNAL_TYPES = new Set(['WritableSignal', 'Signal', 'ReadonlySignal']);

/** Types that need parentheses before `| undefined` or `& {...}` is appended to them. */
const LOOSE_TYPES = new Set(['TSFunctionType', 'TSConstructorType', 'TSConditionalType', 'TSUnionType']);

const CLASS_MEMBER_TYPES = new Set([
	'ClassMethod',
	'ClassPrivateMethod',
	'ClassProperty',
	'ClassPrivateProperty',
	'ClassAccessorProperty',
]);

const FUNCTION_TYPES = new Set(['FunctionExpression', 'FunctionDeclaration', 'ObjectMethod']);

type Position = { line: number; column: number };

type NodeLike = { type: string; loc?: { start: Position; end: Position } | null } & Record<string, unknown>;

/** A replacement of the source text between two offsets. */
type Edit = { start: number; end: number; text: string };

/** Offsets of a node's bounds in the original source text. */
type Offsets = { start: (node: NodeLike) => number; end: (node: NodeLike) => number };

/**
 * How a member's `bind` option read: omitted (the host decides), a companion name, no companion, or unreadable.
 * A `named` bind with an empty name is `bind: true`, whose companion is `$name`.
 */
type Bind = { kind: 'auto' } | { kind: 'named'; name: string } | { kind: 'none' } | { kind: 'unknown' };

type Member = {
	name: string;
	bind: Bind;
	/** The decorator or helper that declared it, which decides how its binding type reads. */
	source: string;
	/** A value the member starts with, used for its type when the class declares no annotation. */
	initializer?: unknown;
	line: number;
};

type ClassInfo = {
	node: NodeLike;
	name?: string;
	members: Map<string, Member>;
	/** Own instance members by name: fields, methods and accessors. */
	declared: Map<string, NodeLike>;
	/** Members whose companion reads this class rewrote. */
	rewritten: Set<string>;
	overridesAutoBind: boolean;
};

type Companion = { member: Member; owner: ClassInfo };

/** A companion name's member, null when its `bind` cannot be read, or `'none'` when it had no companion. */
type CompanionEntry = Companion | null | 'none';

type Context = {
	j: JSCodeshift;
	root: Collection;
	source: string;
	filePath: string;
	pos: Offsets;
	/** Local names imported from `@ecopages/radiant`, mapped to their exported names. */
	radiant: Map<string, string>;
	classes: Map<NodeLike, ClassInfo>;
	companions: Map<ClassInfo, Map<string, CompanionEntry>>;
	edits: Edit[];
	report: (at: unknown, text: string) => void;
};

function isNode(value: unknown): value is NodeLike {
	return typeof value === 'object' && value !== null && typeof (value as NodeLike).type === 'string';
}

function lineOf(node: unknown): number | undefined {
	return isNode(node) ? node.loc?.start.line : undefined;
}

function keyName(node: NodeLike): string | undefined {
	const key = node.key;
	if (node.computed || !isNode(key)) return undefined;
	if (key.type === 'Identifier') return key.name as string;
	if (key.type === 'StringLiteral') return key.value as string;
	return undefined;
}

function stringValue(node: unknown): string | undefined {
	return isNode(node) && node.type === 'StringLiteral' ? (node.value as string) : undefined;
}

/**
 * Reads node offsets from their line and column.
 *
 * @remarks
 * Recast parses a copy of the source with its line endings normalized and its indentation re-measured, so the
 * parser's own `start` and `end` drift from the original text on CRLF or tab-indented files. Line and column
 * stay true when the source is parsed with a tab width of 1.
 */
function offsetsOf(source: string): Offsets {
	const lineStarts = [0];
	for (let index = source.indexOf('\n'); index !== -1; index = source.indexOf('\n', index + 1)) {
		lineStarts.push(index + 1);
	}
	const at = (position: Position) => lineStarts[position.line - 1] + position.column;
	return {
		start: (node) => at((node.loc as { start: Position }).start),
		end: (node) => at((node.loc as { end: Position }).end),
	};
}

function applyEdits(source: string, edits: Edit[]): string {
	let result = source;
	for (const edit of [...edits].sort((a, b) => b.start - a.start)) {
		result = `${result.slice(0, edit.start)}${edit.text}${result.slice(edit.end)}`;
	}
	return result;
}

function readRadiantImports(j: JSCodeshift, root: Collection): Map<string, string> {
	const imports = new Map<string, string>();
	root.find(j.ImportDeclaration)
		.filter((path) => RADIANT_SOURCE.test(String(path.node.source.value)))
		.forEach((path) => {
			for (const specifier of path.node.specifiers ?? []) {
				if (specifier.type !== 'ImportSpecifier') continue;
				imports.set(String(specifier.local?.name ?? specifier.imported.name), String(specifier.imported.name));
			}
		});
	return imports;
}

/** Finds the property named `bind` in an options object, or why it cannot be read. */
function readBind(options: unknown): { bind: Bind; property?: NodeLike } {
	if (options === undefined) return { bind: { kind: 'auto' } };
	if (!isNode(options) || options.type !== 'ObjectExpression') return { bind: { kind: 'unknown' } };
	const properties = options.properties as NodeLike[];
	if (properties.some((property) => property.type === 'SpreadElement')) return { bind: { kind: 'unknown' } };
	const property = properties.find(
		(candidate) => candidate.type === 'ObjectProperty' && keyName(candidate) === 'bind',
	);
	if (!property) return { bind: { kind: 'auto' } };
	const value = property.value as NodeLike;
	if (value.type === 'BooleanLiteral') {
		return { bind: value.value ? { kind: 'named', name: '' } : { kind: 'none' }, property };
	}
	const name = stringValue(value);
	return { bind: name === undefined ? { kind: 'unknown' } : { kind: 'named', name }, property };
}

/**
 * Removes the `bind` property, and the options argument with it when nothing else is left and the parameter is
 * optional. A required options object is left as `{}`.
 */
function removeBind(ctx: Context, call: NodeLike, index: number, property: NodeLike, callee: string): Edit {
	const { pos, source } = ctx;
	const args = call.arguments as NodeLike[];
	const options = args[index];
	const properties = options.properties as NodeLike[];
	const at = properties.indexOf(property);
	if (properties.length > 1) {
		return at < properties.length - 1
			? { start: pos.start(property), end: pos.start(properties[at + 1]), text: '' }
			: { start: pos.end(properties[at - 1]), end: pos.end(property), text: '' };
	}
	if (!OPTIONAL_OPTIONS.has(callee) || index !== args.length - 1) {
		return { start: pos.start(options), end: pos.end(options), text: '{}' };
	}
	if (index > 0) return { start: pos.end(args[index - 1]), end: pos.end(options), text: '' };
	const trailingComma = /^\s*,/.exec(source.slice(pos.end(options)))?.[0].length ?? 0;
	return { start: pos.start(options), end: pos.end(options) + trailingComma, text: '' };
}

/** Removes a class member with its leading comments, and its line when nothing else is on it. */
function removeMember(ctx: Context, member: NodeLike): Edit {
	const { pos, source } = ctx;
	const comments = ((member.leadingComments ?? []) as NodeLike[]).filter(
		(comment) => pos.start(comment) < pos.start(member),
	);
	let start = pos.start(comments.length > 0 ? comments[0] : member);
	let end = pos.end(member);
	const lineStart = source.lastIndexOf('\n', start - 1) + 1;
	const lineEnd = source.indexOf('\n', end);
	const restOfLine = source.slice(end, lineEnd === -1 ? undefined : lineEnd);
	if (source.slice(lineStart, start).trim() === '' && restOfLine.trim() === '') {
		start = lineStart;
		end = lineEnd === -1 ? source.length : lineEnd + 1;
	}
	return { start, end, text: '' };
}

/**
 * Returns the class whose instance `this` is at `path`, or null when `this` belongs to a function, a static
 * member or no class at all.
 */
function owningClass(path: ASTPath): NodeLike | null {
	for (let current: ASTPath | null = path.parent; current; current = current.parent) {
		const node = current.node as NodeLike;
		if (FUNCTION_TYPES.has(node.type) || node.type === 'StaticBlock') return null;
		if (CLASS_MEMBER_TYPES.has(node.type)) {
			return node.static ? null : ((current.parent?.parent?.node as NodeLike | undefined) ?? null);
		}
	}
	return null;
}

function isWriteTarget(path: ASTPath): boolean {
	const parent = path.parent?.node as NodeLike | undefined;
	if (!parent) return false;
	if (parent.type === 'AssignmentExpression' && parent.left === path.node) return true;
	if (parent.type === 'UpdateExpression') return true;
	return parent.type === 'UnaryExpression' && parent.operator === 'delete';
}

/** Whether a computed key on `this` spells a `$`-prefixed name: `'$count'`, `` `$${name}` `` or `'$' + name`. */
function isDollarKey(key: unknown): boolean {
	if (!isNode(key)) return false;
	if (key.type === 'StringLiteral') return /^\$./.test(key.value as string);
	if (key.type === 'TemplateLiteral') {
		const [first] = key.quasis as Array<{ value: { raw: string } }>;
		return first?.value.raw.startsWith('$') ?? false;
	}
	if (key.type === 'BinaryExpression' && key.operator === '+') return isDollarKey(key.left);
	return false;
}

/** The value type of a `WritableSignal<T>` annotation on a `@signal` member, or the annotation itself. */
function signalValueType(member: Member, annotation: NodeLike): NodeLike {
	if (member.source !== 'signal' || annotation.type !== 'TSTypeReference') return annotation;
	const typeName = annotation.typeName as NodeLike;
	const params = (annotation.typeParameters as NodeLike | undefined)?.params as NodeLike[] | undefined;
	const isSignal = typeName.type === 'Identifier' && SIGNAL_TYPES.has(typeName.name as string);
	return isSignal && params?.length === 1 ? params[0] : annotation;
}

function includesUndefined(type: NodeLike): boolean {
	if (type.type === 'TSUndefinedKeyword') return true;
	return type.type === 'TSUnionType' && (type.types as NodeLike[]).some((part) => part.type === 'TSUndefinedKeyword');
}

function literalType(value: NodeLike | undefined): string | undefined {
	if (!value) return undefined;
	if (value.type === 'NumericLiteral') return 'number';
	if (value.type === 'UnaryExpression' && value.operator === '-') {
		return (value.argument as NodeLike).type === 'NumericLiteral' ? 'number' : undefined;
	}
	if (value.type === 'StringLiteral' || value.type === 'TemplateLiteral') return 'string';
	return value.type === 'BooleanLiteral' ? 'boolean' : undefined;
}

/**
 * The binding type of a member as source text, from its annotation or a literal initializer, or undefined when
 * it cannot tell. A `@signal` field typed `WritableSignal<T>` binds `T`; an optional field adds `| undefined`.
 */
function bindingType(ctx: Context, member: Member, field: NodeLike | undefined): string | undefined {
	const annotation = (field?.typeAnnotation as NodeLike | undefined)?.typeAnnotation as NodeLike | undefined;
	if (!annotation) return literalType((field?.value ?? member.initializer) as NodeLike | undefined);
	const type = signalValueType(member, annotation);
	const text = ctx.source.slice(ctx.pos.start(type), ctx.pos.end(type));
	if (!field?.optional || includesUndefined(type)) return text;
	return type.type === 'TSUnionType' || !LOOSE_TYPES.has(type.type) ? `${text} | undefined` : `(${text}) | undefined`;
}

/** Collects the keys a binding type argument lists, or null when part of it lies outside this file. */
function typeArgumentKeys(ctx: Context, type: NodeLike, seen = new Set<string>()): Set<string> | null {
	if (type.type === 'TSTypeLiteral' || type.type === 'TSInterfaceBody') {
		const members = (type.members ?? type.body) as NodeLike[];
		return new Set(members.map(keyName).filter((name): name is string => name !== undefined));
	}
	if (type.type === 'TSIntersectionType') {
		const keys = new Set<string>();
		for (const part of type.types as NodeLike[]) {
			const partKeys = typeArgumentKeys(ctx, part, seen);
			if (!partKeys) return null;
			for (const key of partKeys) keys.add(key);
		}
		return keys;
	}
	return referencedTypeKeys(ctx, type, seen);
}

/** Collects the keys of a type alias or interface declared in this file and named by `type`. */
function referencedTypeKeys(ctx: Context, type: NodeLike, seen: Set<string>): Set<string> | null {
	const typeName = type.typeName as NodeLike | undefined;
	if (type.type !== 'TSTypeReference' || typeName?.type !== 'Identifier' || type.typeParameters) return null;
	const name = typeName.name as string;
	if (seen.has(name)) return null;
	seen.add(name);
	const { j, root } = ctx;
	const alias = root.find(j.TSTypeAliasDeclaration, { id: { name } });
	if (alias.length === 1) return typeArgumentKeys(ctx, alias.get().node.typeAnnotation as NodeLike, seen);
	const declaration = root.find(j.TSInterfaceDeclaration, { id: { name } });
	if (declaration.length !== 1 || declaration.get().node.extends) return null;
	return typeArgumentKeys(ctx, declaration.get().node.body as NodeLike, seen);
}

function collectClasses(j: JSCodeshift, root: Collection): Map<NodeLike, ClassInfo> {
	const classes = new Map<NodeLike, ClassInfo>();
	for (const path of [...root.find(j.ClassDeclaration).paths(), ...root.find(j.ClassExpression).paths()]) {
		const node = path.node as unknown as NodeLike;
		const declared = new Map<string, NodeLike>();
		for (const member of (node.body as NodeLike).body as NodeLike[]) {
			const name = keyName(member);
			if (name !== undefined && !member.static) declared.set(name, member);
		}
		classes.set(node, {
			node,
			name: (node.id as NodeLike | null)?.name as string | undefined,
			members: new Map(),
			declared,
			rewritten: new Set(),
			overridesAutoBind: declared.has('shouldAutoBindReactiveMembers'),
		});
	}
	return classes;
}

function classByName(ctx: Context, name: string): ClassInfo | undefined {
	return [...ctx.classes.values()].find((info) => info.name === name);
}

/** The chain of this class and its bases declared in this file, nearest first. */
function chain(ctx: Context, info: ClassInfo): ClassInfo[] {
	const result = [info];
	let base = info.node.superClass as NodeLike | null;
	while (base?.type === 'Identifier') {
		const parent = classByName(ctx, base.name as string);
		if (!parent || result.includes(parent)) break;
		result.push(parent);
		base = parent.node.superClass as NodeLike | null;
	}
	return result;
}

function declaredInChain(ctx: Context, info: ClassInfo, name: string): NodeLike | undefined {
	return chain(ctx, info)
		.map((owner) => owner.declared.get(name))
		.find((node) => node !== undefined);
}

/** Whether members with `bind` omitted had a companion: yes, no, or undefined when the base is elsewhere. */
function autoBinds(ctx: Context, info: ClassInfo): boolean | undefined {
	for (const owner of chain(ctx, info)) {
		if (owner.overridesAutoBind) return undefined;
		const base = owner.node.superClass as NodeLike | null;
		if (!base) return false;
		if (base.type !== 'Identifier') return undefined;
		const imported = ctx.radiant.get(base.name as string);
		if (imported) return AUTO_BIND_BASES.has(imported) ? true : undefined;
	}
	return undefined;
}

/** Resolves `Class.prototype, 'name'` arguments to the class in this file and the member name. */
function prototypeTarget(ctx: Context, args: NodeLike[]): { owner: ClassInfo; name: string } | undefined {
	const [target, key] = args;
	const name = stringValue(key);
	if (!isNode(target) || target.type !== 'MemberExpression' || name === undefined) return undefined;
	const object = target.object as NodeLike;
	if (object.type !== 'Identifier' || (target.property as NodeLike).name !== 'prototype') return undefined;
	const owner = classByName(ctx, object.name as string);
	return owner ? { owner, name } : undefined;
}

/**
 * Records the member a `bind`-carrying call declares and removes its `bind`, or reports a `bind` it cannot
 * read or a custom name on a member it cannot place.
 */
function handleOptions(
	ctx: Context,
	call: NodeLike,
	index: number,
	callee: string,
	target: { owner: ClassInfo; name: string } | undefined,
	initializer?: unknown,
): void {
	const { bind, property } = readBind((call.arguments as unknown[])[index]);
	if (target) {
		const line = lineOf(call) ?? 0;
		target.owner.members.set(target.name, { name: target.name, bind, source: callee, initializer, line });
	}
	if (!property) return;
	if (bind.kind === 'unknown') {
		ctx.report(
			property,
			`${callee} has a bind option this codemod cannot read; remove it and read the member through this.$.`,
		);
		return;
	}
	if (bind.kind === 'named' && bind.name !== '' && !target) {
		ctx.report(
			property,
			`${callee} has bind: '${bind.name}' on a member this codemod cannot place; remove it and read the member through this.$.`,
		);
		return;
	}
	ctx.edits.push(removeBind(ctx, call, index, property, callee));
}

/** Reads the reactive members a class declares with decorators on its fields. */
function collectDecoratedMembers(ctx: Context, owner: ClassInfo): void {
	for (const field of owner.declared.values()) {
		const name = keyName(field) as string;
		for (const decorator of (field.decorators ?? []) as NodeLike[]) {
			const expression = decorator.expression as NodeLike;
			const callee = expression.type === 'CallExpression' ? (expression.callee as NodeLike) : expression;
			const imported = callee.type === 'Identifier' ? ctx.radiant.get(callee.name as string) : undefined;
			if (!imported) continue;
			if (expression === callee && BARE_DECORATORS.has(imported)) {
				owner.members.set(name, { name, bind: { kind: 'auto' }, source: imported, line: lineOf(field) ?? 0 });
			} else if (expression !== callee && OPTION_FACTORIES.has(imported)) {
				handleOptions(ctx, expression, 0, imported, { owner, name });
			}
		}
	}
}

/**
 * Reads a decorator applied by a call, as `state(Class.prototype, 'name')` or
 * `signal({ ... })(Class.prototype, 'name')`, and any other call of an options factory.
 */
function collectFactoryCall(ctx: Context, path: ASTPath, call: NodeLike, imported: string): void {
	const bare = BARE_DECORATORS.has(imported) ? prototypeTarget(ctx, call.arguments as NodeLike[]) : undefined;
	if (bare) {
		const line = lineOf(call) ?? 0;
		bare.owner.members.set(bare.name, { name: bare.name, bind: { kind: 'auto' }, source: imported, line });
		return;
	}
	if (!OPTION_FACTORIES.has(imported)) return;
	const outer = path.parent.node as NodeLike;
	const applied = outer.type === 'CallExpression' && outer.callee === call;
	handleOptions(ctx, call, 0, imported, applied ? prototypeTarget(ctx, outer.arguments as NodeLike[]) : undefined);
}

/** Reads a `createReactiveProp` or `createReactiveField` call; only one on `this` belongs to a class. */
function collectHelperCall(ctx: Context, path: ASTPath, call: NodeLike, method: string): void {
	const callee = call.callee as NodeLike;
	const args = call.arguments as NodeLike[];
	const owner =
		(callee.object as NodeLike).type === 'ThisExpression'
			? ctx.classes.get(owningClass(path) as NodeLike)
			: undefined;
	const name = stringValue(args[0]);
	const target = owner && name !== undefined ? { owner, name } : undefined;
	handleOptions(
		ctx,
		call,
		MEMBER_HELPERS[method],
		method,
		target,
		method === 'createReactiveField' ? args[1] : undefined,
	);
}

function collectMembers(ctx: Context): void {
	for (const owner of ctx.classes.values()) collectDecoratedMembers(ctx, owner);
	ctx.root.find(ctx.j.CallExpression).forEach((path) => {
		const call = path.node as unknown as NodeLike;
		const callee = call.callee as NodeLike;
		if (callee.type === 'Identifier') {
			const imported = ctx.radiant.get(callee.name as string);
			if (imported) collectFactoryCall(ctx, path, call, imported);
			return;
		}
		const property = callee.property as NodeLike | undefined;
		const method = callee.type === 'MemberExpression' && !callee.computed ? (property?.name as string) : undefined;
		if (method && Object.hasOwn(MEMBER_HELPERS, method)) collectHelperCall(ctx, path, call, method);
	});
}

function resolveBind(bind: Bind, auto: boolean | undefined): Bind {
	if (bind.kind !== 'auto') return bind;
	if (auto === undefined) return { kind: 'unknown' };
	return auto ? { kind: 'named', name: '' } : { kind: 'none' };
}

/** Maps each companion name readable in a class to its member, as 0.9.0 created them. */
function companionsOf(ctx: Context, info: ClassInfo): Map<string, CompanionEntry> {
	const result = new Map<string, CompanionEntry>();
	for (const owner of chain(ctx, info).reverse()) {
		const auto = autoBinds(ctx, owner);
		for (const member of owner.members.values()) {
			const bind = resolveBind(member.bind, auto);
			const custom = bind.kind === 'named' && bind.name !== '';
			const name = custom ? bind.name : `$${member.name}`;
			if (bind.kind === 'none') result.set(name, 'none');
			else result.set(name, bind.kind === 'unknown' ? null : { member, owner });
		}
	}
	return result;
}

/**
 * Reports a `$name` read in a Radiant file whose class inherits from outside the file, where a base member's
 * companion may be what it reads.
 */
function reportForeignRead(ctx: Context, property: NodeLike, info: ClassInfo, name: string): void {
	if (!/^\$./.test(name) || ctx.radiant.size === 0 || autoBinds(ctx, info) !== undefined) return;
	ctx.report(
		property,
		`reads ${name} in a class whose base is outside this file; if it is a companion binding of a base member, read it as this.$.name.`,
	);
}

/** Rewrites or reports a read of `this.<name>` inside the class `info`. */
function migrateRead(ctx: Context, path: ASTPath, info: ClassInfo, name: string): void {
	const property = (path.node as unknown as NodeLike).property as NodeLike;
	const companion = ctx.companions.get(info)?.get(name);
	const own = declaredInChain(ctx, info, name);
	if (companion === undefined) {
		if (!own) reportForeignRead(ctx, property, info, name);
		return;
	}
	if (own && !own.declare) {
		if (own.type === 'ClassProperty' && !own.value && companion !== null && companion !== 'none') {
			ctx.report(
				property,
				`reads ${name}, which the class also declares as a field; remove the field and read the member through this.$.`,
			);
		}
		return;
	}
	if (companion === 'none') {
		ctx.report(
			property,
			`reads ${name}, but the member had no companion binding, so this read undefined; if it meant the binding, read it as this.$.${name.slice(1)}.`,
		);
		return;
	}
	if (companion === null) {
		ctx.report(
			property,
			`reads ${name}, but this codemod cannot tell whether the member had a companion binding; if it did, read it through this.$.`,
		);
		return;
	}
	if (isWriteTarget(path)) {
		ctx.report(
			property,
			`writes ${name}, a companion binding that Radiant 0.10.0 removed; companion bindings were read-only.`,
		);
		return;
	}
	ctx.edits.push({ start: ctx.pos.start(property), end: ctx.pos.end(property), text: `$.${companion.member.name}` });
	info.rewritten.add(companion.member.name);
}

/** Rewrites companion reads on `this` and reports the member accesses this codemod cannot migrate. */
function migrateMemberAccess(ctx: Context, fileCompanions: Set<string>): void {
	ctx.root.find(ctx.j.MemberExpression).forEach((path) => {
		const node = path.node as unknown as NodeLike;
		const object = node.object as NodeLike;
		const property = node.property as NodeLike;
		if (node.computed) {
			if (object.type === 'ThisExpression' && isDollarKey(property)) {
				ctx.report(
					node,
					'reads a $-prefixed member through a computed key, which this codemod cannot follow; a companion binding is now read as this.$.name.',
				);
			}
			return;
		}
		if (property.type !== 'Identifier') return;
		const name = property.name as string;
		if (REMOVED_HOST_METHODS.has(name)) {
			ctx.report(node, `uses ${name}, which Radiant 0.10.0 removed; reactive members are read through this.$.`);
			return;
		}
		const info = object.type === 'ThisExpression' ? ctx.classes.get(owningClass(path) as NodeLike) : undefined;
		if (info) {
			migrateRead(ctx, path, info, name);
		} else if (fileCompanions.has(name)) {
			ctx.report(
				node,
				`reads ${name} outside the class that declares it; read the member through the binding namespace, as element.$.name.`,
			);
		}
	});
}

function reportDestructuring(ctx: Context): void {
	ctx.root.find(ctx.j.VariableDeclarator, { init: { type: 'ThisExpression' } }).forEach((path) => {
		const id = path.node.id as unknown as NodeLike;
		const info = ctx.classes.get(owningClass(path) as NodeLike);
		if (id.type !== 'ObjectPattern' || !info) return;
		for (const property of id.properties as NodeLike[]) {
			const name = keyName(property);
			const companion = name === undefined ? undefined : ctx.companions.get(info)?.get(name);
			if (companion !== undefined && companion !== 'none') {
				ctx.report(property, `destructures ${name} from this; destructure the member from this.$ instead.`);
			}
		}
	});
}

/** Adds the signatures to the type argument after `base`, creating it, extending its literal or intersecting it. */
function typeArgumentEdit(ctx: Context, base: NodeLike, existing: NodeLike | undefined, signatures: string[]): Edit {
	const { pos, source } = ctx;
	const literal = `{ ${signatures.join('; ')} }`;
	if (!existing) return { start: pos.end(base), end: pos.end(base), text: `<${literal}>` };
	if (existing.type !== 'TSTypeLiteral') {
		const text = source.slice(pos.start(existing), pos.end(existing));
		const operand = LOOSE_TYPES.has(existing.type) ? `(${text})` : text;
		return { start: pos.start(existing), end: pos.end(existing), text: `${operand} & ${literal}` };
	}
	const last = (existing.members as NodeLike[]).at(-1);
	if (!last) return { start: pos.start(existing), end: pos.end(existing), text: literal };
	const separated = /[;,]$/.test(source.slice(pos.start(last), pos.end(last)));
	if (existing.loc?.start.line === existing.loc?.end.line) {
		const added = signatures.join('; ');
		return { start: pos.end(last), end: pos.end(last), text: separated ? ` ${added};` : `; ${added}` };
	}
	const lineStart = source.lastIndexOf('\n', pos.start(last) - 1) + 1;
	const indent = /^[ \t]*/.exec(source.slice(lineStart))?.[0] ?? '';
	const lineTerminator = source.includes('\r\n') ? '\r\n' : '\n';
	const added = signatures.map((signature) => `${lineTerminator}${indent}${signature};`).join('');
	return { start: pos.end(last), end: pos.end(last), text: `${separated ? '' : ';'}${added}` };
}

/** Adds each rewritten member to the binding type argument of the class's `extends`. */
function addBindingTypes(ctx: Context, info: ClassInfo): void {
	if (info.rewritten.size === 0 || !/\.[cm]?tsx?$/.test(ctx.filePath)) return;
	const base = info.node.superClass as NodeLike | null;
	const imported = base?.type === 'Identifier' ? ctx.radiant.get(base.name as string) : undefined;
	if (!base || !imported || !GENERIC_BASES.has(imported)) {
		const reads = [...info.rewritten].map((name) => `this.$.${name}`).join(', ');
		ctx.report(
			info.node,
			`reads ${reads} in a class that does not extend RadiantElement or RadiantController directly; type those bindings on the class that does.`,
		);
		return;
	}
	const existing = (
		(info.node.superTypeParameters as NodeLike | null | undefined)?.params as NodeLike[] | undefined
	)?.[0];
	const keys = existing ? typeArgumentKeys(ctx, existing) : new Set<string>();
	const members = [...info.rewritten]
		.filter((name) => !keys?.has(name))
		.map(
			(name) =>
				chain(ctx, info)
					.map((owner) => owner.members.get(name))
					.find(Boolean) as Member,
		)
		.sort((a, b) => a.line - b.line);
	const signatures: string[] = [];
	for (const member of members) {
		const field = declaredInChain(ctx, info, member.name);
		const type = bindingType(ctx, member, field);
		if (type) {
			signatures.push(`${member.name}: ${type}`);
		} else {
			ctx.report(
				field ?? member.line,
				`cannot tell the type of ${member.name}; add ${member.name} with its type to the ${imported} type argument by hand.`,
			);
		}
	}
	if (signatures.length > 0) ctx.edits.push(typeArgumentEdit(ctx, base, existing, signatures));
}

/** Reports overrides of the removed host methods and removes the `declare` fields that typed a companion. */
function finishClass(ctx: Context, info: ClassInfo): void {
	for (const name of REMOVED_HOST_METHODS) {
		const member = info.declared.get(name);
		if (member) ctx.report(member, `overrides ${name}, which Radiant 0.10.0 removed; remove the override.`);
	}
	for (const [name, companion] of ctx.companions.get(info) ?? []) {
		const own = info.declared.get(name);
		if (companion && companion !== 'none' && own?.declare) ctx.edits.push(removeMember(ctx, own));
	}
	addBindingTypes(ctx, info);
}

function reportBindingOptionImports(ctx: Context): void {
	ctx.root
		.find(ctx.j.ImportSpecifier, { imported: { name: 'ReactiveBindingOption' } })
		.filter((path) =>
			RADIANT_SOURCE.test(String((path.parent.node as { source: { value: unknown } }).source.value)),
		)
		.forEach((path) =>
			ctx.report(
				path.node,
				'imports ReactiveBindingOption, which Radiant 0.10.0 removed; drop the import and the bind option it typed.',
			),
		);
}

export default function transform(file: FileInfo, api: API, _options: Options): string | null {
	const j = api.jscodeshift;
	const root = j(file.source, { tabWidth: 1 } as Options);
	const messages: Array<{ line: number | undefined; text: string }> = [];
	const ctx: Context = {
		j,
		root,
		source: file.source,
		filePath: file.path,
		pos: offsetsOf(file.source),
		radiant: readRadiantImports(j, root),
		classes: collectClasses(j, root),
		companions: new Map(),
		edits: [],
		report: (at, text) => messages.push({ line: typeof at === 'number' ? at : lineOf(at), text }),
	};

	collectMembers(ctx);
	const fileCompanions = new Set<string>();
	for (const info of ctx.classes.values()) {
		const companions = companionsOf(ctx, info);
		ctx.companions.set(info, companions);
		for (const [name, companion] of companions) if (companion && companion !== 'none') fileCompanions.add(name);
	}
	migrateMemberAccess(ctx, fileCompanions);
	reportDestructuring(ctx);
	for (const info of ctx.classes.values()) finishClass(ctx, info);
	reportBindingOptionImports(ctx);

	messages
		.sort((a, b) => (a.line ?? 0) - (b.line ?? 0))
		.forEach(({ line, text }) => api.report(`${TRANSFORM}: ${file.path}:${line ?? '?'}: ${text}`));

	return ctx.edits.length > 0 ? applyEdits(file.source, ctx.edits) : null;
}
