export type WorkerUrlKind =
	/** A relative literal URL of a module worker, or of a worker whose options cannot be read statically. */
	| 'entry'
	/** A relative literal URL of a classic worker: no options, or options whose `type` is not `'module'`. */
	| 'classic'
	/** A URL that is not a string literal. */
	| 'dynamic'
	/** A literal URL that does not start with `./` or `../`. */
	| 'non-relative';

export type WorkerUrl = {
	kind: WorkerUrlKind;
	constructorName: 'Worker' | 'SharedWorker';
	/** The literal URL, or the source text of a `dynamic` one. */
	specifier: string;
	/** Start offset of the URL argument of `new URL(...)`, quotes included. */
	start: number;
	/** End offset of the URL argument of `new URL(...)`, quotes included. */
	end: number;
	/** Start and end offsets of the whole `new URL(...)` expression. */
	expression: { start: number; end: number };
};

type AstNode = Record<string, unknown> & { type: string; start: number; end: number };

/** Tells whether source text can hold a Worker URL, before it is parsed. */
export const WORKER_CONSTRUCTOR_PATTERN = /\bnew\s+(?:Shared)?Worker\s*\(/;

function isNode(value: unknown): value is AstNode {
	return Boolean(value) && typeof value === 'object' && typeof (value as { type?: unknown }).type === 'string';
}

function isIdentifier(node: unknown, name: string): boolean {
	return isNode(node) && node.type === 'Identifier' && node.name === name;
}

function isImportMetaUrl(node: unknown): boolean {
	if (!isNode(node) || node.type !== 'MemberExpression' || node.computed) return false;
	const object = node.object;
	return (
		isNode(object) &&
		object.type === 'MetaProperty' &&
		isIdentifier(object.meta, 'import') &&
		isIdentifier(object.property, 'meta') &&
		isIdentifier(node.property, 'url')
	);
}

function readLiteralString(node: AstNode): string | undefined {
	if (node.type === 'Literal' && typeof node.value === 'string') return node.value;
	if (node.type === 'TemplateLiteral' && Array.isArray(node.expressions) && node.expressions.length === 0) {
		const [quasi] = node.quasis as Array<{ value: { cooked: string | null } }>;
		return quasi?.value.cooked ?? undefined;
	}
	return undefined;
}

function readPropertyName(property: AstNode): string | undefined {
	if (property.computed) return undefined;
	const key = property.key;
	if (!isNode(key)) return undefined;
	if (key.type === 'Identifier') return key.name as string;
	return readLiteralString(key);
}

/**
 * Whether the worker options make it a classic worker.
 *
 * @remarks
 * Options that are not an object literal, a `type` that is not a literal, and a spread whose `type` is unknown
 * all count as a module worker: the build cannot tell, and an author who wrote them chose the options at run time.
 */
function isClassicWorker(options: unknown): boolean {
	if (options === undefined) return true;
	if (!isNode(options) || options.type !== 'ObjectExpression') return false;
	const properties = options.properties as AstNode[];
	const typeProperty = properties.find(
		(property) => property.type === 'Property' && readPropertyName(property) === 'type',
	);
	if (!typeProperty) return !properties.some((property) => property.type === 'SpreadElement');
	const value = typeProperty.value;
	if (!isNode(value)) return false;
	const literal = readLiteralString(value);
	return literal !== undefined && literal !== 'module';
}

function isRelativeSpecifier(specifier: string): boolean {
	return specifier.startsWith('./') || specifier.startsWith('../');
}

function readWorkerUrl(node: AstNode, code: string): WorkerUrl | undefined {
	const callee = node.callee;
	const constructorName = isIdentifier(callee, 'Worker')
		? 'Worker'
		: isIdentifier(callee, 'SharedWorker')
			? 'SharedWorker'
			: undefined;
	if (!constructorName) return undefined;
	const [urlExpression, options] = node.arguments as unknown[];
	if (
		!isNode(urlExpression) ||
		urlExpression.type !== 'NewExpression' ||
		!isIdentifier(urlExpression.callee, 'URL')
	) {
		return undefined;
	}
	const [url, base] = urlExpression.arguments as unknown[];
	if (!isNode(url) || !isImportMetaUrl(base)) return undefined;
	const location = {
		constructorName,
		start: url.start,
		end: url.end,
		expression: { start: urlExpression.start, end: urlExpression.end },
	} as const;
	const specifier = readLiteralString(url);
	if (specifier === undefined) return { ...location, kind: 'dynamic', specifier: code.slice(url.start, url.end) };
	if (!isRelativeSpecifier(specifier)) return { ...location, kind: 'non-relative', specifier };
	return { ...location, kind: isClassicWorker(options) ? 'classic' : 'entry', specifier };
}

/**
 * Lists every `new (Shared)Worker(new URL(..., import.meta.url))` of a parsed module, in source order.
 *
 * @remarks
 * Only this static bundler pattern is read; `window.Worker`, `self.Worker` and `globalThis.Worker` are not.
 * Production builds each relative module Worker URL as its own entry and the dev transform server points it at
 * its own module URL, so a source path never reaches the browser.
 */
export function findWorkerUrls(program: unknown, code: string): WorkerUrl[] {
	const urls: WorkerUrl[] = [];
	const visit = (value: unknown): void => {
		if (Array.isArray(value)) {
			for (const child of value) visit(child);
			return;
		}
		if (!isNode(value)) return;
		if (value.type === 'NewExpression') {
			const url = readWorkerUrl(value, code);
			if (url) urls.push(url);
		}
		for (const [key, child] of Object.entries(value)) {
			if (key !== 'type' && typeof child === 'object') visit(child);
		}
	};
	visit(program);
	return urls.sort((left, right) => left.start - right.start);
}

/** The error for a classic worker, which the build cannot serve as an ES module. */
export function formatClassicWorkerError(url: WorkerUrl, importer: string): string {
	return `new ${url.constructorName}(new URL(${JSON.stringify(url.specifier)}, import.meta.url)) in ${importer} needs { type: 'module' }: Ecopages builds workers as ES modules.`;
}

/** The warning for a Worker URL that is left as written. */
export function formatUnbundledWorkerWarning(url: WorkerUrl, importer: string): string {
	const reason = url.kind === 'dynamic' ? 'is not a string literal' : 'is not relative';
	return `The ${url.constructorName} URL ${url.specifier} in ${importer} ${reason}, so it is left as written and not built; it must point at a file the server serves, such as one under public/.`;
}
