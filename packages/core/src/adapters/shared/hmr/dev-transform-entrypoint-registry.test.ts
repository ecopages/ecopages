import assert from 'node:assert/strict';
import path from 'node:path';
import { test } from 'vitest';
import { DevTransformEntrypointRegistry } from './dev-transform-entrypoint-registry.ts';

test('registerTransformModule tracks dev-transform URLs in watched files', () => {
	const registry = new DevTransformEntrypointRegistry();
	const entrypointPath = '/app/src/layouts/base-layout/base-layout.script.ts';

	registry.registerTransformModule(entrypointPath, '/assets/__eco_dev__/layouts/base-layout/base-layout.script.js', {
		role: 'script',
	});

	const registered = registry.getRegisteredEntrypoints().get(path.resolve(entrypointPath));
	assert.equal(registered?.outputUrl, '/assets/__eco_dev__/layouts/base-layout/base-layout.script.js');
	assert.equal(registered?.role, 'script');
	assert.equal(registry.getWatchedOutputUrls().get(path.resolve(entrypointPath)), registered?.outputUrl);
});

test('clearRegistration removes tracked entrypoints', () => {
	const registry = new DevTransformEntrypointRegistry();
	const entrypointPath = '/app/src/pages/index.tsx';

	registry.registerTransformModule(entrypointPath, '/assets/__eco_dev__/pages/index.js', { role: 'page' });
	registry.clearRegistration(entrypointPath);

	assert.equal(registry.getRegisteredEntrypoints().size, 0);
});
