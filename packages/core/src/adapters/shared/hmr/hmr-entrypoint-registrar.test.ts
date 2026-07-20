import assert from 'node:assert/strict';
import path from 'node:path';
import { test } from 'vitest';
import { HmrEntrypointRegistrar } from './hmr-entrypoint-registrar.ts';

test('registerTransformModule tracks dev-transform URLs in watched files', () => {
	const registrar = new HmrEntrypointRegistrar();
	const entrypointPath = '/app/src/layouts/base-layout/base-layout.script.ts';

	registrar.registerTransformModule(entrypointPath, '/assets/__eco_dev__/layouts/base-layout/base-layout.script.js', {
		role: 'script',
	});

	const registered = registrar.getRegistered().get(path.resolve(entrypointPath));
	assert.equal(registered?.outputUrl, '/assets/__eco_dev__/layouts/base-layout/base-layout.script.js');
	assert.equal(registered?.role, 'script');
	assert.equal(registrar.getWatchedFiles().get(path.resolve(entrypointPath)), registered?.outputUrl);
});

test('clearRegistration removes tracked entrypoints', () => {
	const registrar = new HmrEntrypointRegistrar();
	const entrypointPath = '/app/src/pages/index.tsx';

	registrar.registerTransformModule(entrypointPath, '/assets/__eco_dev__/pages/index.js', { role: 'page' });
	registrar.clearRegistration(entrypointPath);

	assert.equal(registrar.getRegistered().size, 0);
});
