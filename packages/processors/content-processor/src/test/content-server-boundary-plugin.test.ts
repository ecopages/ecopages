import { describe, expect, test } from 'vitest';
import type { EcoBuildOnResolveArgs, EcoBuildPluginBuilder } from '@ecopages/core/plugins/processor';
import { createContentServerBoundaryPlugin } from '../content-server-boundary-plugin.ts';

describe('createContentServerBoundaryPlugin', () => {
	test('throws when a collection /server specifier reaches the browser bundle', () => {
		let resolve: ((args: EcoBuildOnResolveArgs) => unknown) | undefined;
		const build: EcoBuildPluginBuilder = {
			onResolve(_options, callback) {
				resolve = callback;
			},
			onLoad() {},
			module() {},
		};

		createContentServerBoundaryPlugin().setup(build);

		expect(resolve).toBeDefined();
		expect(() =>
			resolve?.({
				path: 'ecopages:content/posts/server',
				importer: '/app/src/pages/posts/[slug].tsx',
			}),
		).toThrow(
			"Server-only content module 'ecopages:content/posts/server' reached the browser bundle from /app/src/pages/posts/[slug].tsx",
		);
	});
});
