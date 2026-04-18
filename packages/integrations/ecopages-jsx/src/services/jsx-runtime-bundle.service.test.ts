import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { test } from 'vitest';
import type { EcoBuildOnResolveResult } from '../../../../core/src/build/build-types.ts';
import {
	collectRuntimeSpecifierAliasMap,
	rewriteRuntimeSpecifierAliases,
} from '../../../../core/src/build/runtime-specifier-aliases.ts';
import { JsxRuntimeBundleService } from './jsx-runtime-bundle.service.ts';

const repoRoot = fileURLToPath(new URL('../../../../../', import.meta.url));

test('JsxRuntimeBundleService exposes runtime alias data for emitted browser chunks', async () => {
	const service = new JsxRuntimeBundleService({ radiant: true });
	const specifierMap = await service.getSpecifierMap();
	const plugin = service.getBuildPlugin();
	const registrations: Array<{
		filter: RegExp;
		callback: (args: {
			path: string;
		}) => EcoBuildOnResolveResult | undefined | Promise<EcoBuildOnResolveResult | undefined>;
	}> = [];

	plugin.setup({
		onResolve(options, callback) {
			registrations.push({ filter: options.filter, callback });
		},
		onLoad() {},
		module() {},
	});

	assert.equal(registrations.length, 1);
	assert.equal(registrations[0]?.filter.test('@ecopages/radiant'), true);
	assert.deepEqual(await registrations[0]?.callback({ path: '@ecopages/radiant' }), {
		path: specifierMap['@ecopages/radiant'],
		external: true,
	});

	const aliasMap = collectRuntimeSpecifierAliasMap([plugin]);
	assert.equal(aliasMap.get('@ecopages/jsx/jsx-runtime'), specifierMap['@ecopages/jsx/jsx-runtime']);
	assert.equal(aliasMap.get('@ecopages/radiant'), specifierMap['@ecopages/radiant']);
	assert.equal(
		rewriteRuntimeSpecifierAliases(
			'import { RadiantComponent } from "@ecopages/radiant";\nimport { jsx } from "@ecopages/jsx/jsx-runtime";',
			aliasMap,
		),
		`import { RadiantComponent } from "${specifierMap['@ecopages/radiant']}";\nimport { jsx } from "${specifierMap['@ecopages/jsx/jsx-runtime']}";`,
	);
});

test('JsxRuntimeBundleService excludes server-only Radiant subpaths from the browser runtime map', async () => {
	const service = new JsxRuntimeBundleService({ radiant: true });
	const specifierMap = await service.getSpecifierMap();

	assert.equal('@ecopages/jsx/server' in specifierMap, false);
	assert.equal(
		specifierMap['@ecopages/radiant/decorators/custom-element'],
		'/assets/vendors/ecopages-radiant-esm.js',
	);
	assert.equal(specifierMap['@ecopages/radiant/core/radiant-element'], '/assets/vendors/ecopages-radiant-esm.js');
	assert.equal('@ecopages/radiant/server/render-component' in specifierMap, false);
	assert.equal('@ecopages/radiant/tools/stringify-typed' in specifierMap, false);
	assert.equal('@ecopages/radiant/signals/host-resource' in specifierMap, false);
});

test('JsxRuntimeBundleService builds the Radiant vendor from curated browser-safe subpaths', async () => {
	const service = new JsxRuntimeBundleService({ radiant: true, rootDir: repoRoot });
	const dependencies = await service.getDependencies();
	const jsxDependency = dependencies.find(
		(dependency) => dependency.source === 'node-module' && dependency.name === 'ecopages-jsx-esm',
	);
	const radiantDependency = dependencies.find(
		(dependency) => dependency.source === 'node-module' && dependency.name === 'ecopages-radiant-esm',
	);

	assert.ok(jsxDependency && jsxDependency.source === 'node-module');
	assert.match(jsxDependency.importPath, /ecopages-jsx-esm-entry\.mjs$/);

	const jsxEntrySource = readFileSync(jsxDependency.importPath, 'utf8');

	assert.match(jsxEntrySource, /export \* from '.*node_modules\/@ecopages\/jsx\/dist\/index\.js';/);
	assert.doesNotMatch(jsxEntrySource, /assets\/vendors\/ecopages-jsx-esm/);
	assert.doesNotMatch(jsxEntrySource, /@ecopages\/jsx\/server/);

	assert.ok(radiantDependency && radiantDependency.source === 'node-module');
	assert.match(radiantDependency.importPath, /ecopages-radiant-esm-entry\.mjs$/);

	const entrySource = readFileSync(radiantDependency.importPath, 'utf8');

	assert.match(
		entrySource,
		/export \{ RadiantComponent \} from '.*\/node_modules\/@ecopages\/radiant\/dist\/core\/radiant-component\.js';/,
	);
	assert.match(
		entrySource,
		/export \{ customElement \} from '.*\/node_modules\/@ecopages\/radiant\/dist\/decorators\/custom-element\.js';/,
	);
	assert.doesNotMatch(entrySource, /from '@ecopages\/radiant';/);
	assert.doesNotMatch(entrySource, /export \{ \$ \}/);
});
