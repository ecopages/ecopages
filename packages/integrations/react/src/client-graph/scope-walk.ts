/**
 * Scope-aware walk over an Oxc ESTree program that reports runtime references to names
 * the walked code does not declare itself.
 */

/**
 * Hooks for {@link walkScopedReferences}.
 */
export type ScopedReferenceVisitor = {
	/** Called for each runtime reference to a name no enclosing scope inside the walk declares. */
	onReference(name: string, node: any): void;
	/**
	 * Called before a node is walked. Return `true` to skip the node and its children.
	 *
	 * @remarks
	 * The hook can walk children itself with `walk(child)`; they keep the scope of `node`.
	 */
	onNode?(node: any, walk: (child: unknown) => void): boolean;
};

type Scope = ReadonlySet<string>;

/** Keys that hold type-only syntax and never contain a runtime reference. */
const TYPE_ONLY_KEYS = new Set([
	'typeAnnotation',
	'typeParameters',
	'typeArguments',
	'returnType',
	'superTypeArguments',
	'implements',
]);

/** TypeScript expression wrappers whose `expression` operand is evaluated at runtime. */
const RUNTIME_TS_EXPRESSIONS = new Set([
	'TSAsExpression',
	'TSSatisfiesExpression',
	'TSNonNullExpression',
	'TSTypeAssertion',
	'TSInstantiationExpression',
]);

const FUNCTION_TYPES = new Set(['FunctionDeclaration', 'FunctionExpression', 'ArrowFunctionExpression']);

/**
 * Adds every name a binding pattern declares to `names`.
 */
export function collectPatternNames(pattern: any, names: Set<string>): void {
	if (!pattern || typeof pattern !== 'object') return;
	switch (pattern.type) {
		case 'Identifier':
			names.add(pattern.name);
			return;
		case 'ObjectPattern':
			for (const property of pattern.properties ?? []) {
				collectPatternNames(property.type === 'RestElement' ? property.argument : property.value, names);
			}
			return;
		case 'ArrayPattern':
			for (const element of pattern.elements ?? []) collectPatternNames(element, names);
			return;
		case 'RestElement':
			collectPatternNames(pattern.argument, names);
			return;
		case 'AssignmentPattern':
			collectPatternNames(pattern.left, names);
			return;
		case 'TSParameterProperty':
			collectPatternNames(pattern.parameter, names);
			return;
	}
}

function isDeclaredOnly(node: any): boolean {
	return node.declare === true || node.type === 'TSDeclareFunction';
}

const NAMED_DECLARATION_TYPES = new Set([
	'FunctionDeclaration',
	'ClassDeclaration',
	'TSEnumDeclaration',
	'TSDeclareFunction',
	'TSModuleDeclaration',
	'TSImportEqualsDeclaration',
]);

function unwrapExport(statement: any): any {
	return statement?.type === 'ExportNamedDeclaration' || statement?.type === 'ExportDefaultDeclaration'
		? statement.declaration
		: statement;
}

/**
 * Collects the names a statement declares in the block that directly contains it.
 */
export function collectLexicalDeclarations(statement: any, names: Set<string>): void {
	const declaration = unwrapExport(statement);
	if (declaration?.type === 'VariableDeclaration') {
		for (const declarator of declaration.declarations) collectPatternNames(declarator.id, names);
	} else if (NAMED_DECLARATION_TYPES.has(declaration?.type) && declaration.id?.type === 'Identifier') {
		names.add(declaration.id.name);
	} else if (declaration?.type === 'ImportDeclaration') {
		for (const specifier of declaration.specifiers ?? []) names.add(specifier.local.name);
	}
}

/**
 * Collects `var` names hoisted to the function or program scope from nested blocks.
 */
function collectHoistedVars(node: unknown, names: Set<string>): void {
	if (!node || typeof node !== 'object') return;
	if (Array.isArray(node)) {
		for (const child of node) collectHoistedVars(child, names);
		return;
	}
	const astNode = node as any;
	if (FUNCTION_TYPES.has(astNode.type) || astNode.type === 'ClassBody') return;
	if (astNode.type === 'VariableDeclaration' && astNode.kind === 'var') {
		for (const declarator of astNode.declarations) collectPatternNames(declarator.id, names);
	}
	for (const key in astNode) {
		if (key !== 'type' && key !== 'start' && key !== 'end' && !TYPE_ONLY_KEYS.has(key)) {
			collectHoistedVars(astNode[key], names);
		}
	}
}

function extendScope(scope: Scope, names: Iterable<string>): Scope {
	const extended = new Set(scope);
	for (const name of names) extended.add(name);
	return extended;
}

function blockScope(scope: Scope, statements: readonly unknown[]): Scope {
	const names = new Set<string>();
	for (const statement of statements) collectLexicalDeclarations(statement, names);
	return names.size > 0 ? extendScope(scope, names) : scope;
}

class ScopedReferenceWalker {
	private readonly visitor: ScopedReferenceVisitor;

	constructor(visitor: ScopedReferenceVisitor) {
		this.visitor = visitor;
	}

	walk(node: unknown, scope: Scope): void {
		if (!node || typeof node !== 'object') return;
		if (Array.isArray(node)) {
			for (const child of node) this.walk(child, scope);
			return;
		}
		const astNode = node as any;
		if (typeof astNode.type !== 'string') return;
		if (this.visitor.onNode?.(astNode, (child) => this.walk(child, scope))) return;
		if (!this.walkKnownNode(astNode, scope)) this.walkChildren(astNode, scope);
	}

	reference(name: string, node: any, scope: Scope): void {
		if (!scope.has(name)) this.visitor.onReference(name, node);
	}

	private walkChildren(node: any, scope: Scope): void {
		for (const key in node) {
			if (key === 'type' || key === 'start' || key === 'end' || TYPE_ONLY_KEYS.has(key)) {
				continue;
			}
			this.walk(node[key], scope);
		}
	}

	/**
	 * Walks the runtime parts of a binding pattern: defaults, computed keys and decorators.
	 */
	private walkPattern(pattern: any, scope: Scope): void {
		if (!pattern || typeof pattern !== 'object') return;
		switch (pattern.type) {
			case 'Identifier':
				this.walk(pattern.decorators, scope);
				return;
			case 'ObjectPattern':
				for (const property of pattern.properties ?? []) {
					if (property.type === 'RestElement') {
						this.walkPattern(property.argument, scope);
						continue;
					}
					if (property.computed) this.walk(property.key, scope);
					this.walkPattern(property.value, scope);
				}
				return;
			case 'ArrayPattern':
				for (const element of pattern.elements ?? []) this.walkPattern(element, scope);
				return;
			case 'RestElement':
				this.walkPattern(pattern.argument, scope);
				return;
			case 'AssignmentPattern':
				this.walkPattern(pattern.left, scope);
				this.walk(pattern.right, scope);
				return;
			case 'TSParameterProperty':
				this.walk(pattern.decorators, scope);
				this.walkPattern(pattern.parameter, scope);
				return;
			default:
				this.walk(pattern, scope);
		}
	}

	/**
	 * Walks a function: parameter defaults see the parameters but not the body's declarations.
	 */
	walkFunction(node: any, scope: Scope): void {
		if (isDeclaredOnly(node) || !node.body) return;
		const paramNames = new Set<string>();
		if (node.type !== 'FunctionDeclaration' && node.id?.type === 'Identifier') paramNames.add(node.id.name);
		for (const param of node.params ?? []) collectPatternNames(param, paramNames);
		if (node.type !== 'ArrowFunctionExpression') paramNames.add('arguments');
		const paramScope = extendScope(scope, paramNames);
		for (const param of node.params ?? []) this.walkPattern(param, paramScope);
		if (node.body.type !== 'BlockStatement') {
			this.walk(node.body, paramScope);
			return;
		}
		const bodyNames = new Set<string>();
		collectHoistedVars(node.body.body, bodyNames);
		for (const statement of node.body.body) collectLexicalDeclarations(statement, bodyNames);
		this.walk(node.body.body, extendScope(paramScope, bodyNames));
	}

	walkClass(node: any, scope: Scope): void {
		if (isDeclaredOnly(node)) return;
		this.walk(node.decorators, scope);
		this.walk(node.superClass, scope);
		const classScope =
			node.type === 'ClassExpression' && node.id?.type === 'Identifier'
				? extendScope(scope, [node.id.name])
				: scope;
		this.walk(node.body, classScope);
	}

	walkClassMember(node: any, scope: Scope): void {
		this.walk(node.decorators, scope);
		if (node.computed) this.walk(node.key, scope);
		this.walk(node.value, scope);
	}

	walkJsxName(node: any, scope: Scope, isObject = false): void {
		if (node?.type === 'JSXIdentifier') {
			if (node.name !== 'this' && (isObject || !/^[a-z]/.test(node.name))) this.reference(node.name, node, scope);
			return;
		}
		if (node?.type === 'JSXMemberExpression') this.walkJsxName(node.object, scope, true);
	}

	walkForStatement(node: any, scope: Scope): void {
		const head = node.type === 'ForStatement' ? node.init : node.left;
		const loopScope = head?.type === 'VariableDeclaration' ? blockScope(scope, [head]) : scope;
		this.walkChildren(node, loopScope);
	}

	/**
	 * Walks node types whose children are not all runtime references in the current scope.
	 *
	 * @returns `true` when the node was fully walked.
	 */
	private walkKnownNode(node: any, scope: Scope): boolean {
		const handler = NODE_HANDLERS[node.type];
		if (handler) {
			handler(this, node, scope);
			return true;
		}
		if (RUNTIME_TS_EXPRESSIONS.has(node.type)) {
			this.walk(node.expression, scope);
			return true;
		}
		return node.type.startsWith('TS');
	}

	walkSwitch(node: any, scope: Scope): void {
		this.walk(node.discriminant, scope);
		const caseScope = blockScope(
			scope,
			node.cases.flatMap((switchCase: any) => switchCase.consequent),
		);
		for (const switchCase of node.cases) {
			this.walk(switchCase.test, caseScope);
			this.walk(switchCase.consequent, caseScope);
		}
	}

	walkCatch(node: any, scope: Scope): void {
		const names = new Set<string>();
		collectPatternNames(node.param, names);
		const catchScope = extendScope(scope, names);
		this.walkPattern(node.param, catchScope);
		this.walk(node.body, catchScope);
	}

	walkVariableDeclaration(node: any, scope: Scope): void {
		if (node.declare) return;
		for (const declarator of node.declarations) {
			this.walkPattern(declarator.id, scope);
			this.walk(declarator.init, scope);
		}
	}

	walkExportNamed(node: any, scope: Scope): void {
		if (node.exportKind === 'type') return;
		if (node.declaration) {
			this.walk(node.declaration, scope);
			return;
		}
		if (node.source) return;
		for (const specifier of node.specifiers ?? []) {
			if (specifier.exportKind !== 'type' && specifier.local?.type === 'Identifier') {
				this.reference(specifier.local.name, specifier.local, scope);
			}
		}
	}
}

type NodeHandler = (walker: ScopedReferenceWalker, node: any, scope: Scope) => void;

const skip: NodeHandler = () => {};
const walkFunction: NodeHandler = (walker, node, scope) => walker.walkFunction(node, scope);
const walkBlock: NodeHandler = (walker, node, scope) => walker.walk(node.body, blockScope(scope, node.body));
const walkFor: NodeHandler = (walker, node, scope) => walker.walkForStatement(node, scope);
const walkClass: NodeHandler = (walker, node, scope) => walker.walkClass(node, scope);
const walkClassMember: NodeHandler = (walker, node, scope) => walker.walkClassMember(node, scope);

/** Node types whose children are not all runtime references in the enclosing scope. */
const NODE_HANDLERS: Record<string, NodeHandler> = {
	Identifier: (walker, node, scope) => walker.reference(node.name, node, scope),
	Program: (walker, node, scope) =>
		walker.walk(node.body, blockScope(extendScope(scope, collectProgramVars(node)), node.body)),
	FunctionDeclaration: walkFunction,
	FunctionExpression: walkFunction,
	ArrowFunctionExpression: walkFunction,
	TSDeclareFunction: skip,
	BlockStatement: walkBlock,
	StaticBlock: walkBlock,
	SwitchStatement: (walker, node, scope) => walker.walkSwitch(node, scope),
	ForStatement: walkFor,
	ForInStatement: walkFor,
	ForOfStatement: walkFor,
	CatchClause: (walker, node, scope) => walker.walkCatch(node, scope),
	VariableDeclaration: (walker, node, scope) => walker.walkVariableDeclaration(node, scope),
	ClassDeclaration: walkClass,
	ClassExpression: walkClass,
	MethodDefinition: walkClassMember,
	PropertyDefinition: walkClassMember,
	AccessorProperty: walkClassMember,
	TSEnumDeclaration: (walker, node, scope) => {
		if (node.declare) return;
		const members = node.body?.members ?? node.members ?? [];
		const memberNames = members.flatMap((member: any) =>
			member.id?.type === 'Identifier' ? [member.id.name] : [],
		);
		const enumScope = extendScope(scope, memberNames);
		for (const member of members) walker.walk(member.initializer, enumScope);
	},
	TSModuleDeclaration: (walker, node, scope) => {
		if (node.declare || node.body?.type !== 'TSModuleBlock') {
			if (!node.declare && node.body) walker.walk(node.body, scope);
			return;
		}
		walker.walk(node.body.body, blockScope(scope, node.body.body));
	},
	TSImportEqualsDeclaration: (walker, node, scope) => {
		if (node.importKind === 'type') return;
		let reference = node.moduleReference;
		while (reference?.type === 'TSQualifiedName') reference = reference.left;
		if (reference?.type === 'Identifier') walker.reference(reference.name, reference, scope);
	},
	UnaryExpression: (walker, node, scope) => {
		if (node.operator === 'typeof' && node.argument?.type === 'Identifier') return;
		walker.walk(node.argument, scope);
	},
	TSExportAssignment: (walker, node, scope) => walker.walk(node.expression, scope),
	MemberExpression: (walker, node, scope) => {
		walker.walk(node.object, scope);
		if (node.computed) walker.walk(node.property, scope);
	},
	Property: (walker, node, scope) => {
		if (node.computed) walker.walk(node.key, scope);
		walker.walk(node.value, scope);
	},
	LabeledStatement: (walker, node, scope) => walker.walk(node.body, scope),
	BreakStatement: skip,
	ContinueStatement: skip,
	MetaProperty: skip,
	ImportDeclaration: skip,
	ExportAllDeclaration: skip,
	ExportNamedDeclaration: (walker, node, scope) => walker.walkExportNamed(node, scope),
	JSXOpeningElement: (walker, node, scope) => {
		walker.walkJsxName(node.name, scope);
		walker.walk(node.attributes, scope);
	},
	JSXClosingElement: skip,
	JSXAttribute: (walker, node, scope) => walker.walk(node.value, scope),
};

function collectProgramVars(program: any): Set<string> {
	const names = new Set<string>();
	collectHoistedVars(program.body, names);
	return names;
}

/**
 * Walks `root` and reports each runtime reference to a name that no scope inside the walk declares.
 *
 * @remarks
 * Type-only syntax (annotations, interfaces, type aliases, `import type`, `declare`) is skipped;
 * the operand of `as`, `satisfies` and `!`, enums and namespaces are walked. Property keys,
 * member names, labels and intrinsic JSX tags are not references, and neither is the bare
 * identifier operand of `typeof`, which cannot throw. Walking a `Program` puts its top-level declarations
 * in scope; walk its statements one by one to see references to them.
 */
export function walkScopedReferences(
	root: unknown,
	visitor: ScopedReferenceVisitor,
	scope: ReadonlySet<string> = new Set(),
): void {
	new ScopedReferenceWalker(visitor).walk(root, scope);
}
