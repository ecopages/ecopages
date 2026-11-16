import { getInlineLayoutEntries, isPropertyNamed } from './ast-transform-eco-page.ts';

/**
 * Adds the layout tiers of a `layout` option as roots: every tier except the `props` factory of an inline entry.
 *
 * @remarks
 * The browser renders the layout components, so what they reference is browser code. An inline entry's factory
 * runs only on the server and the page transform removes it. A tier that is not an object literal, such as an
 * entry imported from another module, is a root whole, so its module's export is requested and its server
 * imports fail the browser build instead of turning the tier into `undefined`.
 */
function collectLayoutRoots(layout: any, roots: unknown[]): void {
	const inlineEntries = new Set(getInlineLayoutEntries(layout));
	const tiers = layout?.type === 'ArrayExpression' ? layout.elements : [layout];
	for (const tier of tiers) {
		if (!tier) continue;
		if (!inlineEntries.has(tier)) {
			roots.push(tier);
			continue;
		}
		for (const property of tier.properties) {
			if (!isPropertyNamed(property, 'props'))
				roots.push(property.type === 'Property' ? property.value : property);
		}
	}
}

function collectEcoPageClientProperties(arg: any, roots: unknown[]): void {
	if (!arg || arg.type !== 'ObjectExpression') return;
	for (const prop of arg.properties ?? []) {
		if (prop?.type === 'Property' && prop.key?.type === 'Identifier') {
			if (['render', 'errorBoundary', 'loadingFallback', 'clientScripts'].includes(prop.key.name)) {
				roots.push(prop.value);
			} else if (isPropertyNamed(prop, 'layout')) {
				collectLayoutRoots(prop.value, roots);
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
