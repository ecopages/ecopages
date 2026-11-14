/**
 * Oxlint JS plugin that keeps a file's role out of folder names in `packages/**\/src`.
 *
 * @remarks
 * A file's role comes from its name, from a reference to it, or from the Route Registry, never from sitting in a
 * folder called `pages`, `layouts`, `components` or `views` (CONTEXT.md, Role Suffix). The rule reports a string,
 * template or regular expression that holds one of those names as a whole path segment, which is how a folder check
 * is written: `path.join(srcDir, 'views')`, `includes('/layouts/')`, `/\/pages\//`. `.oxlintrc.json` exempts the
 * router and `file-roles.ts`, the two owners of the answer, and test code.
 */

type Node = { type: string; parent?: Node; [key: string]: unknown };
type Context = { report(descriptor: { node: Node; message: string }): void };

const ROLE_FOLDERS = ['pages', 'layouts', 'components', 'views'] as const;
const ROLE_FOLDER_ALTERNATIVES = ROLE_FOLDERS.join('|');

/** A role folder between two slashes or at either end of the string. */
const FOLDER_SEGMENT = new RegExp(`(^|/)(${ROLE_FOLDER_ALTERNATIVES})(/|$)`);

/** The same in a regular expression source, where a slash may be escaped and a boundary may be an anchor or a group. */
const REGEX_FOLDER_SEGMENT = new RegExp(`(^|[\\\\/^(|])(${ROLE_FOLDER_ALTERNATIVES})($|[\\\\/$)|])`);

const MESSAGE =
	'Do not decide a file role from a pages, layouts, components or views folder. Declare it by file name (a role suffix or a `_` prefix), by a reference such as eco.page({ layout }), or ask the Route Registry; see CONTEXT.md.';

/** Parents that name a module or a type with the string. */
const MODULE_OR_TYPE_PARENTS = new Set([
	'ImportDeclaration',
	'ExportAllDeclaration',
	'ExportNamedDeclaration',
	'ImportExpression',
	'TSLiteralType',
	'TSExternalModuleReference',
	'TSImportType',
]);

/** Parents whose non-computed key is a property name. */
const KEYED_PARENTS = new Set(['Property', 'PropertyDefinition', 'MethodDefinition']);

/** Strings that name a module, a type or a property instead of a path the code reads. */
function isNotAPath(node: Node): boolean {
	const parent = node.parent;
	if (!parent) return false;
	if (MODULE_OR_TYPE_PARENTS.has(parent.type)) return true;
	if (KEYED_PARENTS.has(parent.type)) return parent.key === node && !parent.computed;
	if (parent.type === 'MemberExpression') return parent.property === node && parent.computed === true;
	return parent.type === 'BinaryExpression' && parent.operator === 'in' && parent.left === node;
}

const noFolderRoleCheck = {
	meta: {
		type: 'problem',
		docs: { description: 'Disallow deciding a file role from a pages, layouts, components or views folder name.' },
	},
	create(context: Context) {
		return {
			Literal(node: Node & { value?: unknown; regex?: { pattern: string } }) {
				if (node.regex) {
					if (REGEX_FOLDER_SEGMENT.test(node.regex.pattern)) context.report({ node, message: MESSAGE });
					return;
				}
				if (typeof node.value === 'string' && FOLDER_SEGMENT.test(node.value) && !isNotAPath(node)) {
					context.report({ node, message: MESSAGE });
				}
			},
			TemplateElement(node: Node & { value: { cooked?: string | null } }) {
				if (node.value.cooked && FOLDER_SEGMENT.test(node.value.cooked)) {
					context.report({ node, message: MESSAGE });
				}
			},
		};
	},
};

export default {
	meta: { name: 'ecopages-roles' },
	rules: {
		'no-folder-role-check': noFolderRoleCheck,
	},
};
