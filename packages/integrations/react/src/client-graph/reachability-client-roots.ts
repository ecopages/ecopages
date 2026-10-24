function collectEcoPageClientProperties(arg: any, roots: unknown[]): void {
	if (!arg || arg.type !== 'ObjectExpression') return;
	for (const prop of arg.properties ?? []) {
		if (prop?.type === 'Property' && prop.key?.type === 'Identifier') {
			if (['render', 'errorBoundary', 'loadingFallback', 'clientScripts'].includes(prop.key.name)) {
				roots.push(prop.value);
			}
		}
	}
}

function inspectEcoMemberCall(node: any, roots: unknown[]): void {
	roots.push(node.callee);
	collectEcoPageClientProperties(node.arguments?.[0], roots);
}

/**
 * Inspects a node to determine if it represents an Ecopages client root declaration.
 */
function isEcoFactoryCall(node: any): boolean {
	if (node.callee?.type !== 'MemberExpression') return false;
	const obj = node.callee.object;
	const prop = node.callee.property;
	return (
		obj?.type === 'Identifier' &&
		obj.name === 'eco' &&
		prop?.type === 'Identifier' &&
		(prop.name === 'page' || prop.name === 'component' || prop.name === 'layout')
	);
}

export function checkPotentialClientRoot(node: unknown, roots: unknown[]): void {
	if (!node || typeof node !== 'object') return;
	const astNode = node as any;

	if (astNode.type === 'CallExpression' && isEcoFactoryCall(astNode)) {
		inspectEcoMemberCall(astNode, roots);
		return;
	}

	if (
		astNode.type === 'CallExpression' &&
		astNode.callee?.type === 'Identifier' &&
		astNode.callee.name === 'dynamic'
	) {
		roots.push(node);
	}
}
