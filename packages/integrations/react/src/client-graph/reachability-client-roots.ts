export type ClientRootScanState = {
	potentialClientRoots: unknown[];
	pagePreloadRoots: unknown[];
	hasEcoPageRoot: boolean;
};

export function createClientRootScanState(): ClientRootScanState {
	return {
		potentialClientRoots: [],
		pagePreloadRoots: [],
		hasEcoPageRoot: false,
	};
}

function collectEcoPageClientProperties(arg: any, state: ClientRootScanState): void {
	if (!arg || arg.type !== 'ObjectExpression') return;
	for (const prop of arg.properties ?? []) {
		if (prop?.type === 'Property' && prop.key?.type === 'Identifier') {
			if (['render', 'errorBoundary', 'loadingFallback', 'clientScripts'].includes(prop.key.name)) {
				state.potentialClientRoots.push(prop.value);
			}
		}
	}
}

function inspectEcoMemberCall(node: any, state: ClientRootScanState): void {
	const propName = node.callee.property?.name;
	if (propName === 'page') {
		state.hasEcoPageRoot = true;
	}
	state.potentialClientRoots.push(node.callee);
	collectEcoPageClientProperties(node.arguments?.[0], state);
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

export function checkPotentialClientRoot(node: unknown, state: ClientRootScanState): void {
	if (!node || typeof node !== 'object') return;
	const astNode = node as any;

	if (astNode.type === 'CallExpression' && isEcoFactoryCall(astNode)) {
		inspectEcoMemberCall(astNode, state);
		return;
	}

	if (
		astNode.type === 'CallExpression' &&
		astNode.callee?.type === 'Identifier' &&
		astNode.callee.name === 'dynamic'
	) {
		state.potentialClientRoots.push(node);
	}
}

export function finalizeClientRoots(state: ClientRootScanState): unknown[] {
	if (state.hasEcoPageRoot) {
		state.potentialClientRoots.push(...state.pagePreloadRoots);
	}
	return state.potentialClientRoots;
}
