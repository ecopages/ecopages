import assert from 'node:assert/strict';
import { test } from 'vitest';
import type { EcoComponent } from '../../../types/public-types.ts';
import { createPreparedComponentGraphBuilder } from './component-graph.ts';

function createComponent(input: { integration?: string; children?: EcoComponent[] }): EcoComponent {
	return {
		config: {
			integration: input.integration,
			dependencies: {
				components: input.children ?? [],
			},
		},
	} as EcoComponent;
}

test('prepared component graph records ownership, direct dependencies, and visible file-backed ancestry', () => {
	const leaf = createComponent({ integration: 'lit' });
	leaf.config!.identity = { id: 'leaf', file: '/app/leaf.ts', integration: 'lit' };
	const anonymous = createComponent({ children: [leaf] });
	const root = createComponent({ integration: 'react', children: [anonymous] });
	root.config!.identity = { id: 'root', file: '/app/root.tsx', integration: 'react' };
	const graphBuilder = createPreparedComponentGraphBuilder('react');

	graphBuilder.addRoots([{ component: root, source: 'page' }]);

	const [rootNode, anonymousNode, leafNode] = graphBuilder.getGraph().nodes;
	assert.equal(rootNode?.foreignDescendant, true);
	assert.equal(rootNode?.dependencyCollectionVisible, true);
	assert.equal(anonymousNode?.dependencyCollectionVisible, false);
	assert.equal(leafNode?.dependencyCollectionVisible, false);
	assert.deepEqual(rootNode?.ownAssets, {
		scripts: root.config?.dependencies?.scripts,
		stylesheets: root.config?.dependencies?.stylesheets,
		modules: root.config?.dependencies?.modules,
	});

	graphBuilder.addRoots([{ component: leaf }]);

	assert.equal(graphBuilder.getGraph().nodes[2]?.dependencyCollectionVisible, true);
});

test('prepared component graph returns visited nodes while adding dependency roots', () => {
	const child = createComponent({ integration: 'lit' });
	child.config!.identity = { id: 'child', file: '/app/child.ts', integration: 'lit' };
	const leaf = createComponent({ integration: 'lit' });
	leaf.config!.identity = { id: 'leaf', file: '/app/leaf.ts', integration: 'lit' };
	child.config!.dependencies!.components = [leaf];
	const root = createComponent({ integration: 'lit', children: [child] });
	root.config!.identity = { id: 'root', file: '/app/root.ts', integration: 'lit' };
	const graphBuilder = createPreparedComponentGraphBuilder('react');

	const first = graphBuilder.addRootsAndCollectNodes([{ component: root, source: 'dependency' }]);
	const repeated = graphBuilder.addRootsAndCollectNodes([{ component: root, source: 'dependency' }]);

	assert.deepEqual(
		first.roots.map((node) => node.component),
		[root],
	);
	assert.deepEqual(
		first.nodes.map((node) => node.component),
		[root, child, leaf],
	);
	assert.deepEqual(
		repeated.nodes.map((node) => node.component),
		[root, child, leaf],
	);

	const shellRoot = createComponent({ integration: 'react', children: [child] });
	shellRoot.config!.identity = { id: 'shell', file: '/app/shell.tsx', integration: 'react' };
	const shellGraphBuilder = createPreparedComponentGraphBuilder('react');
	shellGraphBuilder.addRoots([{ component: shellRoot, source: 'page' }]);
	const pageDependency = createComponent({ integration: 'lit', children: [child] });
	pageDependency.config!.identity = { id: 'page-dependency', file: '/app/page-dependency.ts', integration: 'lit' };
	const pageDependencyCollection = shellGraphBuilder.addRootsAndCollectNodes([
		{ component: pageDependency, source: 'dependency' },
		{ component: child, source: 'dependency' },
	]);

	assert.deepEqual(
		pageDependencyCollection.nodes.map((node) => node.component),
		[pageDependency, child, leaf],
	);
	assert.deepEqual(
		pageDependencyCollection.nodes.filter((node) => node.dependencyCollectionVisible).map((node) => node.component),
		[pageDependency, child, leaf],
	);
});

test('prepared component graph keeps shared inherited ownership contexts separate', () => {
	const child = createComponent({ integration: 'lit' });
	child.config!.identity = { id: 'child', file: '/app/child.ts', integration: 'lit' };
	const shared = createComponent({ children: [child] });
	const litParent = createComponent({ integration: 'lit', children: [shared] });
	const reactParent = createComponent({ integration: 'react', children: [shared] });
	const graphBuilder = createPreparedComponentGraphBuilder('react');

	graphBuilder.addRoots([{ component: litParent }, { component: reactParent }]);

	const graph = graphBuilder.getGraph();
	const sharedNodes = graph.nodes.filter((node) => node.component === shared);
	assert.deepEqual(sharedNodes.map((node) => node.integrationName).sort(), ['lit', 'react']);
	assert.ok(
		graph.events.some(
			(event) =>
				event.type === 'repeat' &&
				event.component === child &&
				event.parentIntegrationName === 'react' &&
				event.integrationName === 'lit',
		),
	);
});

test('prepared component graph propagates foreign descendants through cycles', () => {
	const foreign = createComponent({ integration: 'lit' });
	const first = createComponent({ integration: 'react' });
	const second = createComponent({ integration: 'react' });
	first.config!.dependencies = { components: [second, foreign] };
	second.config!.dependencies = { components: [first] };
	const graphBuilder = createPreparedComponentGraphBuilder('react');

	graphBuilder.addRoots([{ component: first }]);

	const graph = graphBuilder.getGraph();
	assert.equal(graph.nodes.find((node) => node.component === first)?.foreignDescendant, true);
	assert.equal(graph.nodes.find((node) => node.component === second)?.foreignDescendant, true);
});
