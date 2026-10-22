import { afterEach, describe, expect, it, vi } from 'vitest';
import type { EcoComponent, EcoComponentDependencies } from '../../../types/contracts.ts';
import { createPreparedComponentGraphBuilder } from './component-graph.ts';
import { assertComponentInPreparedGraph, collectPreparedGraphComponentIds } from './prepared-graph-membership.ts';

function createComponent(id: string, file: string, dependencies?: EcoComponentDependencies): EcoComponent<object> {
	const component = (() => '') as EcoComponent<object>;
	component.config = { integration: 'kitajs', identity: { id, file, integration: 'kitajs' }, dependencies };
	return component;
}

function collectIds(roots: EcoComponent<object>[]) {
	const builder = createPreparedComponentGraphBuilder('kitajs');
	builder.addRoots(roots.map((component) => ({ component, source: 'page' as const })));
	return collectPreparedGraphComponentIds(builder.getGraph());
}

describe('prepared graph membership', () => {
	afterEach(() => {
		vi.unstubAllEnvs();
	});

	it('collects no set outside development', () => {
		vi.stubEnv('NODE_ENV', 'production');

		expect(collectIds([createComponent('page', '/app/page.tsx')])).toBeUndefined();
	});

	it('collects roots and the components they list transitively', () => {
		vi.stubEnv('NODE_ENV', 'development');
		const leaf = createComponent('leaf', '/app/leaf.tsx', { stylesheets: ['./leaf.css'] });
		const middle = createComponent('middle', '/app/middle.tsx', { components: [leaf] });
		const page = createComponent('page', '/app/page.tsx', { components: [middle] });

		expect(collectIds([page])).toEqual(new Set(['page', 'middle', 'leaf']));
	});

	it('fails a component in the same file as a declared one but not in the graph', () => {
		vi.stubEnv('NODE_ENV', 'development');
		const card = createComponent('card#Card', '/app/card.tsx', { stylesheets: ['./card.css'] });
		const badge = createComponent('card#Badge', '/app/card.tsx', { stylesheets: ['./badge.css'] });
		const ids = collectIds([createComponent('page', '/app/page.tsx', { components: [card] })]);

		expect(() => assertComponentInPreparedGraph(card, ids)).not.toThrow();
		expect(() => assertComponentInPreparedGraph(badge, ids)).toThrow('/app/card.tsx');
	});

	it('does not collect a component under a parent without an identity file', () => {
		vi.stubEnv('NODE_ENV', 'development');
		const child = createComponent('child', '/app/child.tsx', { stylesheets: ['./child.css'] });
		const fileless = (() => '') as EcoComponent<object>;
		fileless.config = { integration: 'kitajs', dependencies: { components: [child] } };

		expect(collectIds([fileless])?.has('child')).toBe(false);
	});

	it('skips a component without dependencies, an identity file or a set', () => {
		const ids = new Set<string>();
		const plain = createComponent('plain', '/app/plain.tsx');
		const anonymous = (() => '') as EcoComponent<object>;
		anonymous.config = { dependencies: { stylesheets: ['./a.css'] } };
		const declared = createComponent('card', '/app/card.tsx', { stylesheets: ['./card.css'] });

		expect(() => assertComponentInPreparedGraph(plain, ids)).not.toThrow();
		expect(() => assertComponentInPreparedGraph(anonymous, ids)).not.toThrow();
		expect(() => assertComponentInPreparedGraph(declared, undefined)).not.toThrow();
	});
});
