/**
 * Oxlint JS plugin for the forward-slash path convention in `packages/`.
 *
 * @remarks
 * `no-restricted-imports` sees only static `import` and `export ... from`, and Oxlint has no
 * `no-restricted-syntax`. These rules cover the other ways native paths enter package code: `require`, a
 * `createRequire` result or `import()` loading `node:path`, and `import.meta.dirname` or `import.meta.filename`.
 * `process.cwd()` is covered by `no-restricted-properties` in `.oxlintrc.json`.
 */

type Node = { type: string; [key: string]: unknown };
type Context = { report(descriptor: { node: Node; message: string }): void };

const NATIVE_PATH_MODULES = new Set([
	'path',
	'path/posix',
	'path/win32',
	'node:path',
	'node:path/posix',
	'node:path/win32',
]);

/** `import.meta` properties that hold a native path, Bun's `dir` and `path` included. */
const NATIVE_PATH_META_PROPERTIES = new Set(['dirname', 'filename', 'dir', 'path']);

const NATIVE_PATH_MODULE_MESSAGE =
	'Use path from @ecopages/file-system/path, which keeps every path in forward slashes.';
const IMPORT_META_MESSAGE =
	'Use path.fromFileUrl(import.meta.url) from @ecopages/file-system/path, or path.dirname of it for the folder.';

function isIdentifier(node: unknown, name?: string): node is Node & { name: string } {
	const candidate = node as Node | undefined;
	return candidate?.type === 'Identifier' && (name === undefined || candidate.name === name);
}

function stringLiteralValue(node: unknown): string | undefined {
	const candidate = node as (Node & { value?: unknown; quasis?: Array<{ value: { cooked: string } }> }) | undefined;
	if (candidate?.type === 'Literal' && typeof candidate.value === 'string') {
		return candidate.value;
	}
	if (candidate?.type === 'TemplateLiteral' && candidate.quasis?.length === 1) {
		return candidate.quasis[0].value.cooked;
	}
	return undefined;
}

function isCreateRequireCall(node: unknown): boolean {
	const candidate = node as (Node & { callee?: Node }) | undefined;
	if (candidate?.type !== 'CallExpression') {
		return false;
	}
	const callee = candidate.callee as Node & { property?: Node };
	return (
		isIdentifier(callee, 'createRequire') ||
		(callee?.type === 'MemberExpression' && isIdentifier(callee.property, 'createRequire'))
	);
}

const noNativePathModule = {
	meta: {
		type: 'problem',
		docs: { description: 'Disallow loading node:path through require, createRequire or import().' },
	},
	create(context: Context) {
		const requireBindings = new Set<string>(['require']);
		const reportIfNativePath = (node: Node, source: unknown) => {
			const value = stringLiteralValue(source);
			if (value !== undefined && NATIVE_PATH_MODULES.has(value)) {
				context.report({ node, message: NATIVE_PATH_MODULE_MESSAGE });
			}
		};

		return {
			VariableDeclarator(node: Node & { id: Node; init?: Node }) {
				if (isIdentifier(node.id) && isCreateRequireCall(node.init)) {
					requireBindings.add(node.id.name);
				}
			},
			CallExpression(node: Node & { callee: Node; arguments: Node[] }) {
				const callsRequire = isIdentifier(node.callee) && requireBindings.has(node.callee.name);
				if (callsRequire || isCreateRequireCall(node.callee)) {
					reportIfNativePath(node, node.arguments[0]);
				}
			},
			ImportExpression(node: Node & { source: Node }) {
				reportIfNativePath(node, node.source);
			},
		};
	},
};

const noImportMetaNativePath = {
	meta: {
		type: 'problem',
		docs: { description: 'Disallow import.meta properties that hold a native path.' },
	},
	create(context: Context) {
		return {
			MemberExpression(
				node: Node & { object: Node & { meta?: Node; property?: Node }; property: Node; computed: boolean },
			) {
				const { object, property } = node;
				if (
					object.type === 'MetaProperty' &&
					isIdentifier(object.meta, 'import') &&
					isIdentifier(object.property, 'meta') &&
					!node.computed &&
					isIdentifier(property) &&
					NATIVE_PATH_META_PROPERTIES.has(property.name)
				) {
					context.report({ node, message: IMPORT_META_MESSAGE });
				}
			},
		};
	},
};

export default {
	meta: { name: 'ecopages-path' },
	rules: {
		'no-native-path-module': noNativePathModule,
		'no-import-meta-native-path': noImportMetaNativePath,
	},
};
