import assert from 'node:assert/strict';
import path from 'node:path';
import { describe, it } from 'vitest';
import { BuildInputDependencyIndex } from './build-input-dependency-index.ts';

describe('BuildInputDependencyIndex', () => {
	it('answers which Page Browser Graphs, HTML cache entries, and entrypoints recorded a path', () => {
		const index = new BuildInputDependencyIndex();
		index.register({ consumer: 'page-browser-graph', key: 'graph-a' }, ['/app/pages/about.tsx']);
		index.register({ consumer: 'html-cache', key: '/about' }, ['/app/pages/about.tsx', '/app/content/intro.mdx']);
		index.register({ consumer: 'entrypoint', key: '/app/pages/about.tsx' }, [
			'/app/pages/about.tsx',
			'/app/layouts/base.tsx',
		]);

		assert.deepEqual(index.resolveKeys('page-browser-graph', '/app/pages/about.tsx'), ['graph-a']);
		assert.deepEqual(index.resolveKeys('html-cache', '/app/content/intro.mdx'), ['/about']);
		assert.deepEqual(index.resolveKeys('entrypoint', '/app/layouts/base.tsx'), ['/app/pages/about.tsx']);
		assert.deepEqual(
			index
				.resolve('/app/pages/about.tsx')
				.map((binding) => binding.consumer)
				.sort(),
			['entrypoint', 'html-cache', 'page-browser-graph'],
		);
	});

	it('replaces the previous source set when the same result is registered again', () => {
		const index = new BuildInputDependencyIndex();
		index.register({ consumer: 'html-cache', key: '/about' }, ['/app/content/intro.mdx']);
		index.register({ consumer: 'html-cache', key: '/about' }, ['/app/content/updated.mdx']);

		assert.deepEqual(index.resolveKeys('html-cache', '/app/content/intro.mdx'), []);
		assert.deepEqual(index.resolveKeys('html-cache', '/app/content/updated.mdx'), ['/about']);
	});

	it('keeps watching a path after its last result unregisters', () => {
		const index = new BuildInputDependencyIndex();
		index.register({ consumer: 'html-cache', key: '/about' }, ['/app/content/intro.mdx']);
		index.unregister({ consumer: 'html-cache', key: '/about' });

		assert.equal(index.hasSourcePath('/app/content/intro.mdx'), false);
		assert.equal(index.recordedWatchPaths().includes(path.resolve('/app/content/intro.mdx')), true);
	});

	it('notifies watch subscribers the first time a path is recorded', () => {
		const index = new BuildInputDependencyIndex();
		const recorded: string[] = [];
		index.subscribeToWatchPaths((filePath) => recorded.push(filePath));
		index.recordWatchPath('/app/content/intro.mdx');
		index.recordWatchPath('/app/content/intro.mdx');
		index.register({ consumer: 'html-cache', key: '/about' }, ['/app/content/intro.mdx']);

		assert.deepEqual(recorded, [path.resolve('/app/content/intro.mdx')]);
	});
});
