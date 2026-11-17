/**
 * Codemod: migrate-radiant-refs
 *
 * Moves `@ecopages/radiant` code across the ref/query split of Radiant 0.11.0, which removed
 * the `@query` options object, `cache`, the options form of `createQuery` and the `QueryConfig` type.
 *
 * Before:
 *   @query({ ref: 'menubar-root' }) menubarRoot!: HTMLElement | null;
 *   @query({ ref: 'item', all: true }) items!: HTMLElement[];
 *   @query({ selector: 'input', cache: true }) input!: HTMLInputElement | null;
 *   @query({ selector: '[data-row]', all: true }) rows!: HTMLElement[];
 *   readonly title = createQuery(this, { ref: 'title' });
 *
 * After:
 *   @ref() menubarRoot!: HTMLElement | null;
 *   @refAll('item') items!: HTMLElement[];
 *   @query('input') input!: HTMLInputElement | null;
 *   @queryAll('[data-row]') rows!: HTMLElement[];
 *   readonly title = createQuery(this, '[data-ref="title"]');
 *
 * Fields keep their names. `@ref` and `@refAll` get no name when the `ref` equals the field name as an
 * attribute name, the rule Radiant applies to a nameless `@ref` (`menubarRoot` finds `menubar-root`), and the
 * name as written otherwise. `cache` is dropped, and `cache: true` is reported, since the field no longer
 * holds on to the first node. The imports gain `ref`, `refAll`, `queryAll` and `createQueryAll` from the
 * module that exports them, and lose `query` and `createQuery` when nothing reads them any more.
 *
 * Anything it cannot rewrite safely is left unchanged and reported with its line: `QueryConfig` imports,
 * options it cannot read, `getReactiveMember(...).set(...)`, a controller identifier with `:`, a string
 * `ref` attribute in JSX, and a `data-hydration-key` in a file that registers controllers.
 *
 * @remarks
 * `createQuery(host, { ref })` becomes the selector the options form built, `[data-ref="name"]`, which still
 * reaches into nested hosts as before. `getRef(name)` is the scoped alternative, a behaviour change the author
 * chooses by hand. A decorator moves to `@ref` as the release notes direct, and so only sees the parts its
 * host owns: an outer host no longer reads a nested host's part. That change, and `@onEvent({ ref })` no
 * longer firing for a `data-ref` on the host itself, cannot be seen in the source, so they are documented
 * rather than reported.
 */

import type { API, ASTPath, Collection, FileInfo, JSCodeshift, Options } from 'jscodeshift';
import {
	applyEdits,
	type Edit,
	isNode,
	keyName,
	lineOf,
	type NodeLike,
	type Offsets,
	offsetsOf,
	parseOptions,
	RADIANT_SOURCE,
	removeNode,
	stringValue,
} from './source-edits.ts';

export const parser = 'tsx';

const TRANSFORM = 'migrate-radiant-refs';

const QUERY_OPTION_KEYS = new Set(['selector', 'ref', 'all', 'cache']);

const CONTROLLER_REGISTRARS = new Set([
	'controller',
	'registerController',
	'replaceController',
	'registerControllerWithConfiguredStrategy',
]);

const CONTROLLER_EXPORTS = new Set([...CONTROLLER_REGISTRARS, 'RadiantController']);

/**
 * The module that exports each new name, given the module the file reads `query` or `createQuery` from.
 *
 * @remarks
 * The package root exports the decorators but not `createQuery`, which only `helpers/create-query` exports.
 * `@ref` and `@refAll` live in `decorators/ref`, next to `decorators/query`.
 */
const TARGET_MODULES: Readonly<Record<string, Readonly<Record<string, string>>>> = {
	'@ecopages/radiant': { ref: '@ecopages/radiant', refAll: '@ecopages/radiant', queryAll: '@ecopages/radiant' },
	'@ecopages/radiant/decorators/query': {
		ref: '@ecopages/radiant/decorators/ref',
		refAll: '@ecopages/radiant/decorators/ref',
		queryAll: '@ecopages/radiant/decorators/query',
	},
	'@ecopages/radiant/helpers/create-query': { createQueryAll: '@ecopages/radiant/helpers/create-query' },
};

const HYDRATION_KEY_IN_TEXT = /data-hydration-key=(["'])([^"']*)\1/;

type ImportBinding = { imported: string; source: string; specifier: NodeLike; declaration: NodeLike };

type QueryOptions = {
	selector?: NodeLike;
	ref?: NodeLike;
	all: boolean;
	cache?: NodeLike;
	problem?: string;
};

type Context = {
	j: JSCodeshift;
	root: Collection;
	source: string;
	pos: Offsets;
	/** Local names imported from `@ecopages/radiant` and its subpaths. */
	imports: Map<string, ImportBinding>;
	/** The Radiant modules the file has a named import from. */
	importedModules: Set<string>;
	/** Names bound at module level, which a new import must not shadow. */
	topLevelNames: Set<string>;
	/** Names to import, by module, with the declaration a new import statement for that module goes after. */
	additions: Map<string, { names: Set<string>; anchor: NodeLike }>;
	/** How many uses of each local name this transform replaced with another name. */
	replacedUses: Map<string, number>;
	edits: Edit[];
	report: (at: unknown, text: string) => void;
};

/** The part name Radiant derives from a field name: `toKebabCaseAttributeName` in `@ecopages/radiant`. */
export function partNameOf(fieldName: string): string {
	return fieldName
		.replace(/([a-z0-9])([A-Z])/g, '$1-$2')
		.replace(/[_\s]+/g, '-')
		.toLowerCase();
}

function text(ctx: Context, node: NodeLike): string {
	return ctx.source.slice(ctx.pos.start(node), ctx.pos.end(node));
}

function readImports(j: JSCodeshift, root: Collection): Map<string, ImportBinding> {
	const imports = new Map<string, ImportBinding>();
	root.find(j.ImportDeclaration)
		.filter((path) => RADIANT_SOURCE.test(String(path.node.source.value)))
		.forEach((path) => {
			const declaration = path.node as unknown as NodeLike;
			for (const specifier of (declaration.specifiers ?? []) as NodeLike[]) {
				if (specifier.type !== 'ImportSpecifier') continue;
				const imported = String(
					(specifier.imported as NodeLike).name ?? (specifier.imported as NodeLike).value,
				);
				const local = String((specifier.local as NodeLike | undefined)?.name ?? imported);
				imports.set(local, { imported, source: String(path.node.source.value), specifier, declaration });
			}
		});
	return imports;
}

function readTopLevelNames(j: JSCodeshift, root: Collection): Set<string> {
	const names = new Set<string>();
	const program = root.find(j.Program).get().node as unknown as NodeLike;
	for (const statement of program.body as NodeLike[]) {
		const declaration = (
			statement.type.startsWith('Export') ? statement.declaration : statement
		) as NodeLike | null;
		if (!declaration) continue;
		if (declaration.type === 'ImportDeclaration') {
			for (const specifier of declaration.specifiers as NodeLike[])
				names.add(String((specifier.local as NodeLike).name));
		} else if (declaration.type === 'VariableDeclaration') {
			for (const declarator of declaration.declarations as NodeLike[]) {
				const id = declarator.id as NodeLike;
				if (id.type === 'Identifier') names.add(String(id.name));
				else
					j(id as never)
						.find(j.Identifier)
						.forEach((path) => names.add(path.node.name));
			}
		} else if (isNode(declaration.id)) {
			names.add(String(declaration.id.name));
		}
	}
	return names;
}

/**
 * Whether a `@query` or `createQuery` argument is the removed options object: an object literal, or a name
 * this file binds to one.
 *
 * @remarks
 * Any other value is taken for a selector, the new form. An options object that comes from elsewhere is then
 * left alone, and TypeScript rejects it where a selector string is expected.
 */
function isOptionsValue(ctx: Context, value: NodeLike | undefined): value is NodeLike {
	if (!value) return false;
	if (value.type === 'ObjectExpression') return true;
	if (value.type !== 'Identifier') return false;
	return ctx.root
		.find(ctx.j.VariableDeclarator, { id: { type: 'Identifier', name: String(value.name) } })
		.some((path) => (path.node.init as unknown as NodeLike | null)?.type === 'ObjectExpression');
}

/** Reads a `@query` or `createQuery` options object, or names what keeps it from being rewritten. */
function readQueryOptions(options: NodeLike): QueryOptions {
	const result: QueryOptions = { all: false };
	for (const property of options.properties as NodeLike[]) {
		const key = property.type === 'ObjectProperty' ? keyName(property) : undefined;
		if (key === undefined || !QUERY_OPTION_KEYS.has(key)) {
			return { all: false, problem: 'options this codemod cannot read (a spread, a computed or unknown key)' };
		}
		const value = property.value as NodeLike;
		if (key === 'all') {
			if (value.type !== 'BooleanLiteral') return { all: false, problem: 'an `all` that is not true or false' };
			result.all = value.value as boolean;
		} else if (key === 'cache') {
			result.cache = property;
		} else {
			result[key as 'selector' | 'ref'] = value;
		}
	}
	if (Boolean(result.selector) === Boolean(result.ref)) {
		return { all: false, problem: 'options with neither or both of `selector` and `ref`' };
	}
	return result;
}

function reportCache(ctx: Context, options: QueryOptions): void {
	const value = options.cache?.value as NodeLike | undefined;
	if (!options.cache || (value?.type === 'BooleanLiteral' && value.value === false)) return;
	ctx.report(
		options.cache,
		'drops cache, which Radiant removed: the field now reads the DOM on every access; read it once into a local where you need a stable node.',
	);
}

/**
 * Returns the local name to call `exportName` by, queuing its import from the module that exports it, or
 * undefined when that module or name cannot be used.
 */
function localFor(ctx: Context, exportName: string, from: ImportBinding, at: NodeLike): string | undefined {
	for (const [local, binding] of ctx.imports) {
		if (binding.imported === exportName) return local;
	}
	const target = TARGET_MODULES[from.source]?.[exportName];
	if (!target) {
		ctx.report(
			at,
			`needs ${exportName}, but ${from.source} does not export it; import it from @ecopages/radiant by hand.`,
		);
		return undefined;
	}
	if (ctx.topLevelNames.has(exportName)) {
		ctx.report(
			at,
			`needs ${exportName}, but the file already declares that name; rename one and migrate this use by hand.`,
		);
		return undefined;
	}
	const addition = ctx.additions.get(target) ?? { names: new Set<string>(), anchor: from.declaration };
	addition.names.add(exportName);
	ctx.additions.set(target, addition);
	return exportName;
}

function replaceCallee(ctx: Context, callee: NodeLike, local: string): void {
	const current = String(callee.name);
	if (local === current) return;
	ctx.edits.push({ start: ctx.pos.start(callee), end: ctx.pos.end(callee), text: local });
	ctx.replacedUses.set(current, (ctx.replacedUses.get(current) ?? 0) + 1);
}

/** The `@ref` or `@refAll` argument: none when the field name finds the part, the name as written otherwise. */
function refArgument(ctx: Context, ref: NodeLike, field: string | undefined): string {
	const name = stringValue(ref);
	return field !== undefined && name !== undefined && partNameOf(field) === name ? '' : text(ctx, ref);
}

/** Rewrites a `query({ ... })` call, applied as a decorator or to `Class.prototype`, for the field it decorates. */
function migrateQueryDecorator(ctx: Context, call: NodeLike, binding: ImportBinding, field: string | undefined): void {
	const args = call.arguments as NodeLike[];
	const [options] = args;
	if (!isOptionsValue(ctx, options)) return;
	if (options.type !== 'ObjectExpression' || args.length > 1) {
		ctx.report(
			call,
			'passes @query something other than an options literal or a selector string; move it to @ref, @refAll, @query(selector) or @queryAll(selector) by hand.',
		);
		return;
	}
	const read = readQueryOptions(options);
	if (read.problem) {
		ctx.report(
			options,
			`passes @query ${read.problem}; move it to @ref, @refAll, @query(selector) or @queryAll(selector) by hand.`,
		);
		return;
	}
	const exportName = read.ref ? (read.all ? 'refAll' : 'ref') : read.all ? 'queryAll' : 'query';
	const local =
		exportName === 'query' ? String((call.callee as NodeLike).name) : localFor(ctx, exportName, binding, call);
	if (!local) return;
	const argument = read.ref ? refArgument(ctx, read.ref, field) : text(ctx, read.selector as NodeLike);
	replaceCallee(ctx, call.callee as NodeLike, local);
	ctx.edits.push({ start: ctx.pos.start(options), end: ctx.pos.end(options), text: argument });
	reportCache(ctx, read);
}

/** The selector the removed `{ ref }` option built, or undefined when the name needs escaping in it. */
function refSelector(ref: NodeLike): string | undefined {
	const name = stringValue(ref);
	return name === undefined || /["'\\]/.test(name) ? undefined : `'[data-ref="${name}"]'`;
}

function migrateCreateQuery(ctx: Context, call: NodeLike, binding: ImportBinding): void {
	const options = (call.arguments as NodeLike[])[1];
	if (!isOptionsValue(ctx, options)) return;
	const read =
		options.type === 'ObjectExpression'
			? readQueryOptions(options)
			: { all: false, problem: 'an options value it cannot read' };
	const selector = read.ref ? refSelector(read.ref) : read.selector && text(ctx, read.selector);
	if (read.problem || !selector) {
		const why = read.problem ?? 'a `ref` that is not a plain string';
		ctx.report(
			options,
			`passes createQuery ${why}; pass a selector instead, and for a ref use getRef(name) on the host (only the parts it owns) or createQuery(host, '[data-ref="name"]') (nested hosts too, as before).`,
		);
		return;
	}
	const local = read.all ? localFor(ctx, 'createQueryAll', binding, call) : String((call.callee as NodeLike).name);
	if (!local) return;
	replaceCallee(ctx, call.callee as NodeLike, local);
	ctx.edits.push({ start: ctx.pos.start(options), end: ctx.pos.end(options), text: selector });
	reportCache(ctx, read);
}

function reportControllerIdentifier(ctx: Context, call: NodeLike): void {
	const identifier = stringValue((call.arguments as NodeLike[])[0]);
	if (identifier?.includes(':')) {
		ctx.report(
			call,
			`registers the controller identifier '${identifier}', which contains ':'; Radiant now throws on it, because ':' separates the identifier from the field in hydration keys. Rename the controller.`,
		);
	}
}

/** The field a `query(...)` call decorates when it is applied as `query(...)(Class.prototype, 'field')`. */
function prototypeField(path: ASTPath): string | undefined {
	const outer = path.parent?.node as NodeLike | undefined;
	if (outer?.type !== 'CallExpression' || outer.callee !== path.node) return undefined;
	return stringValue((outer.arguments as NodeLike[])[1]);
}

function migrateCall(ctx: Context, path: ASTPath): void {
	const call = path.node as unknown as NodeLike;
	const callee = call.callee as NodeLike;
	const binding = callee.type === 'Identifier' ? ctx.imports.get(String(callee.name)) : undefined;
	if (!binding) return;
	if (binding.imported === 'query') migrateQueryDecorator(ctx, call, binding, prototypeField(path));
	else if (binding.imported === 'createQuery') migrateCreateQuery(ctx, call, binding);
	else if (CONTROLLER_REGISTRARS.has(binding.imported)) reportControllerIdentifier(ctx, call);
}

/** Visits the decorators on classes and their members, which the AST walker does not reach. */
function migrateDecorators(ctx: Context): void {
	const { j, root } = ctx;
	const classes = [
		...root.find(j.ClassDeclaration).nodes(),
		...root.find(j.ClassExpression).nodes(),
	] as unknown as NodeLike[];
	for (const node of classes) {
		for (const decorator of (node.decorators ?? []) as NodeLike[]) migrateDecorator(ctx, decorator, undefined);
		for (const member of (node.body as NodeLike).body as NodeLike[]) {
			for (const decorator of (member.decorators ?? []) as NodeLike[])
				migrateDecorator(ctx, decorator, keyName(member));
		}
	}
}

function migrateDecorator(ctx: Context, decorator: NodeLike, field: string | undefined): void {
	const call = decorator.expression as NodeLike;
	const callee = call.type === 'CallExpression' ? (call.callee as NodeLike) : undefined;
	const binding = callee?.type === 'Identifier' ? ctx.imports.get(String(callee.name)) : undefined;
	if (binding?.imported === 'query') migrateQueryDecorator(ctx, call, binding, field);
	else if (binding?.imported === 'controller') reportControllerIdentifier(ctx, call);
}

function reportReadonlyMembers(ctx: Context): void {
	ctx.root.find(ctx.j.MemberExpression).forEach((path) => {
		const node = path.node as unknown as NodeLike;
		const object = node.object as NodeLike;
		if (node.computed || (node.property as NodeLike).name !== 'set' || object.type !== 'CallExpression') return;
		const callee = object.callee as NodeLike;
		const name = callee.type === 'MemberExpression' ? (callee.property as NodeLike).name : callee.name;
		if (name === 'getReactiveMember') {
			ctx.report(
				node,
				'writes through getReactiveMember(...).set, which Radiant made read-only; assign the host field instead.',
			);
		}
	});
}

function literalAttributeValue(attribute: NodeLike): NodeLike | undefined {
	const value = attribute.value as NodeLike | null;
	if (!value) return undefined;
	const expression = value.type === 'JSXExpressionContainer' ? (value.expression as NodeLike) : value;
	return ['StringLiteral', 'TemplateLiteral'].includes(expression.type) ? expression : undefined;
}

function reportStringRefs(ctx: Context): void {
	ctx.root.find(ctx.j.JSXAttribute).forEach((path) => {
		const attribute = path.node as unknown as NodeLike;
		if ((attribute.name as NodeLike).name === 'ref' && literalAttributeValue(attribute)) {
			ctx.report(
				attribute,
				'sets a string ref attribute, which is now a type error and no longer rendered; ref takes a callback. Use data-ref for a part name.',
			);
		}
	});
}

function reportHydrationKey(ctx: Context, at: NodeLike, key: string): void {
	if (key.includes(':')) return;
	ctx.report(
		at,
		`writes data-hydration-key="${key}"; a hydration script for a controller registered with @controller('id') is now keyed "id:${key}", so update it if it belongs to a controller, or emit it with renderHydrationScriptTag().`,
	);
}

function reportHydrationKeys(ctx: Context): void {
	const { j, root } = ctx;
	root.find(j.JSXAttribute).forEach((path) => {
		const attribute = path.node as unknown as NodeLike;
		const value = literalAttributeValue(attribute);
		if ((attribute.name as NodeLike).name !== 'data-hydration-key' || value?.type !== 'StringLiteral') return;
		reportHydrationKey(ctx, attribute, String(value.value));
	});
	root.find(j.StringLiteral).forEach((path) => {
		const match = HYDRATION_KEY_IN_TEXT.exec(path.node.value);
		if (match) reportHydrationKey(ctx, path.node as unknown as NodeLike, match[2]);
	});
	root.find(j.TemplateElement).forEach((path) => {
		const match = HYDRATION_KEY_IN_TEXT.exec(path.node.value.raw);
		if (match) reportHydrationKey(ctx, path.node as unknown as NodeLike, match[2]);
	});
}

/** How many references to `local` the file holds outside its import, decorators included. */
function countUses(ctx: Context, local: string): number {
	const { j, root } = ctx;
	let uses = root.find(j.Identifier, { name: local }).filter((path) => {
		const parent = path.parent.node as NodeLike;
		if (parent.type === 'ImportSpecifier') return false;
		if (
			(parent.type === 'MemberExpression' || parent.type === 'OptionalMemberExpression') &&
			parent.property === path.node
		) {
			return Boolean(parent.computed);
		}
		return !(parent.type === 'ObjectProperty' && parent.key === path.node && !parent.computed);
	}).length;
	const classes = [
		...root.find(j.ClassDeclaration).nodes(),
		...root.find(j.ClassExpression).nodes(),
	] as unknown as NodeLike[];
	for (const node of classes) {
		const decorated = [node, ...((node.body as NodeLike).body as NodeLike[])];
		for (const decorator of decorated.flatMap((member) => (member.decorators ?? []) as NodeLike[])) {
			uses += j(decorator.expression as never).find(j.Identifier, { name: local }).length;
			if ((decorator.expression as NodeLike).name === local) uses += 1;
		}
	}
	return uses;
}

/** Rewrites the specifier list of one import declaration, keeping its one-line or multi-line layout. */
function specifierListEdit(ctx: Context, declaration: NodeLike, names: string[]): Edit {
	const specifiers = declaration.specifiers as NodeLike[];
	const first = specifiers[0];
	const last = specifiers.at(-1) as NodeLike;
	const lineStart = ctx.source.lastIndexOf('\n', ctx.pos.start(first) - 1) + 1;
	const multiLine = declaration.loc?.start.line !== declaration.loc?.end.line;
	const indent = /^[ \t]*/.exec(ctx.source.slice(lineStart))?.[0] ?? '';
	const separator = multiLine ? `,${lineTerminatorOf(ctx)}${indent}` : ', ';
	return { start: ctx.pos.start(first), end: ctx.pos.end(last), text: names.join(separator) };
}

function lineTerminatorOf(ctx: Context): string {
	return ctx.source.includes('\r\n') ? '\r\n' : '\n';
}

/** An import statement for `module`, quoted and terminated like the declaration it follows. */
function importStatement(ctx: Context, like: NodeLike, module: string, names: Iterable<string>): string {
	const quote = text(ctx, like.source as NodeLike).startsWith('"') ? '"' : "'";
	const semicolon = text(ctx, like).endsWith(';') ? ';' : '';
	return `import { ${[...names].join(', ')} } from ${quote}${module}${quote}${semicolon}`;
}

/** Whether nothing reads `binding` any more once this transform's replacements are made. */
function isUnused(ctx: Context, binding: ImportBinding): boolean {
	const local = String((binding.specifier.local as NodeLike).name);
	const replaced = ctx.replacedUses.get(local) ?? 0;
	return replaced > 0 && countUses(ctx, local) <= replaced;
}

/**
 * Edits one Radiant import declaration: adds the names queued for its module, drops the specifiers nothing
 * reads, and follows it with an import for each queued module the file does not import yet.
 */
function updateDeclaration(ctx: Context, declaration: NodeLike, bindings: ImportBinding[], adds: boolean): void {
	const source = String((declaration.source as NodeLike).value);
	const added = adds ? [...(ctx.additions.get(source)?.names ?? [])] : [];
	const dropped = new Set(bindings.filter((binding) => isUnused(ctx, binding)).map((binding) => binding.specifier));
	const created = [...ctx.additions]
		.filter(([module, addition]) => addition.anchor === declaration && !ctx.importedModules.has(module))
		.map(([module, addition]) => importStatement(ctx, declaration, module, addition.names));
	if (added.length === 0 && dropped.size === 0 && created.length === 0) return;
	const eol = lineTerminatorOf(ctx);
	const kept = ((declaration.specifiers ?? []) as NodeLike[])
		.filter((specifier) => !dropped.has(specifier))
		.map((specifier) => text(ctx, specifier));
	const names = [...kept, ...added];
	const end = ctx.pos.end(declaration);
	if (names.length > 0) {
		ctx.edits.push(specifierListEdit(ctx, declaration, names));
		if (created.length > 0)
			ctx.edits.push({ start: end, end, text: created.map((line) => `${eol}${line}`).join('') });
	} else if (created.length > 0) {
		ctx.edits.push({ start: ctx.pos.start(declaration), end, text: created.join(eol) });
	} else {
		ctx.edits.push(removeNode(ctx.source, ctx.pos, declaration));
	}
}

/** Adds the queued names to the imports and drops `query` and `createQuery` specifiers nothing reads. */
function updateImports(ctx: Context): void {
	const declarations = new Map<NodeLike, ImportBinding[]>();
	for (const binding of ctx.imports.values()) {
		declarations.set(binding.declaration, [...(declarations.get(binding.declaration) ?? []), binding]);
	}
	const firstForModule = new Map<string, NodeLike>();
	for (const declaration of declarations.keys()) {
		const source = String((declaration.source as NodeLike).value);
		if (!firstForModule.has(source)) firstForModule.set(source, declaration);
	}
	for (const [declaration, bindings] of declarations) {
		const source = String((declaration.source as NodeLike).value);
		updateDeclaration(ctx, declaration, bindings, firstForModule.get(source) === declaration);
	}
}

function reportQueryConfigImports(ctx: Context): void {
	for (const binding of ctx.imports.values()) {
		if (binding.imported === 'QueryConfig') {
			ctx.report(
				binding.specifier,
				'imports QueryConfig, which Radiant removed with the @query options object; type the selector as a string.',
			);
		}
	}
}

/** Whether the file is Radiant or `@ecopages/jsx` code, where a string `ref` attribute is the removed form. */
function usesEcopagesJsx(ctx: Context): boolean {
	return ctx.imports.size > 0 || /@jsxImportSource\s+@ecopages\/jsx|from\s+['"]@ecopages\/jsx/.test(ctx.source);
}

export default function transform(file: FileInfo, api: API, _options: Options): string | null {
	const j = api.jscodeshift;
	const root = j(file.source, parseOptions() as Options);
	const messages: Array<{ line: number | undefined; text: string }> = [];
	const imports = readImports(j, root);
	const ctx: Context = {
		j,
		root,
		source: file.source,
		pos: offsetsOf(file.source),
		imports,
		importedModules: new Set([...imports.values()].map((binding) => binding.source)),
		topLevelNames: readTopLevelNames(j, root),
		additions: new Map(),
		replacedUses: new Map(),
		edits: [],
		report: (at, message) => messages.push({ line: typeof at === 'number' ? at : lineOf(at), text: message }),
	};

	migrateDecorators(ctx);
	root.find(j.CallExpression).forEach((path) => migrateCall(ctx, path));
	reportReadonlyMembers(ctx);
	if (usesEcopagesJsx(ctx)) reportStringRefs(ctx);
	if ([...ctx.imports.values()].some((binding) => CONTROLLER_EXPORTS.has(binding.imported))) reportHydrationKeys(ctx);
	reportQueryConfigImports(ctx);
	updateImports(ctx);

	messages
		.sort((a, b) => (a.line ?? 0) - (b.line ?? 0))
		.forEach(({ line, text: message }) => api.report(`${TRANSFORM}: ${file.path}:${line ?? '?'}: ${message}`));

	return ctx.edits.length > 0 ? applyEdits(file.source, ctx.edits) : null;
}
