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
	assert.equal(aliasMap.get('@ecopages/radiant/client/hydrator'), specifierMap['@ecopages/radiant/client/hydrator']);
	assert.equal(
		aliasMap.get('@ecopages/radiant/client/install-hydrator'),
		specifierMap['@ecopages/radiant/client/install-hydrator'],
	);
	assert.equal(
		rewriteRuntimeSpecifierAliases(
			'import { RadiantElement, startControllers } from "@ecopages/radiant";\nimport "@ecopages/radiant/client/install-hydrator";\nimport { jsx } from "@ecopages/jsx/jsx-runtime";',
			aliasMap,
		),
		[
			`import { RadiantElement, startControllers } from "${specifierMap['@ecopages/radiant']}";`,
			`import "${specifierMap['@ecopages/radiant/client/install-hydrator']}";`,
			`import { jsx } from "${specifierMap['@ecopages/jsx/jsx-runtime']}";`,
		].join('\n'),
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
	assert.equal(specifierMap['@ecopages/radiant/client/hydrator'], '/assets/vendors/ecopages-radiant-esm.js');
	assert.equal(
		specifierMap['@ecopages/radiant/client/install-hydrator'],
		'/assets/vendors/ecopages-radiant-esm.js',
	);
	assert.equal(specifierMap['@ecopages/radiant/controller-registry'], '/assets/vendors/ecopages-radiant-esm.js');
	assert.equal(specifierMap['@ecopages/radiant/core/radiant-controller'], '/assets/vendors/ecopages-radiant-esm.js');
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

	assert.match(jsxEntrySource, /http:\/\/www\.w3\.org\/2000\/svg/);
	assert.match(jsxEntrySource, /foreignObject|foreignobject/);
	assert.match(jsxEntrySource, /toLowerCase\(\)===['"]svg['"]/);
	assert.doesNotMatch(jsxEntrySource, /assets\/vendors\/ecopages-jsx-esm/);
	assert.doesNotMatch(jsxEntrySource, /@ecopages\/jsx\/server/);

	assert.ok(radiantDependency && radiantDependency.source === 'node-module');
	assert.match(radiantDependency.importPath, /ecopages-radiant-esm-entry\.mjs$/);

	const entrySource = readFileSync(radiantDependency.importPath, 'utf8');

	assert.match(
		entrySource,
		/import '.*\/node_modules\/@ecopages\/radiant\/dist\/client\/install-hydrator\.js';/,
	);

	assert.match(
		entrySource,
		/export \{ RadiantController \} from '.*\/node_modules\/@ecopages\/radiant\/dist\/core\/radiant-controller\.js';/,
	);
	assert.match(
		entrySource,
		/export \{ customElement \} from '.*\/node_modules\/@ecopages\/radiant\/dist\/decorators\/custom-element\.js';/,
	);
	assert.match(
		entrySource,
		/export \{ [^}]*CONTROLLER_ATTRIBUTE[^}]*ControllerRegistryRuntime[^}]*disableControllerReplacementForHmr[^}]*enableControllerReplacementForHmr[^}]*hasRegisteredController[^}]*registerController[^}]*registerControllerWithConfiguredStrategy[^}]*replaceController[^}]*setControllerRegistrationStrategy[^}]*startControllers[^}]*stopControllers[^}]*\} from '.*\/node_modules\/@ecopages\/radiant\/dist\/controller-registry\.js';/,
	);
	assert.match(
		entrySource,
		/export \{ hasRadiantHydrator, installRadiantHydrator, uninstallRadiantHydrator \} from '.*\/node_modules\/@ecopages\/radiant\/dist\/client\/hydrator\.js';/,
	);
	assert.doesNotMatch(entrySource, /from '@ecopages\/radiant';/);
	assert.doesNotMatch(entrySource, /export \{ \$ \}/);
});

test('JsxRuntimeBundleService keeps plain JSX browser runtime output free of Radiant bootstrap assets', async () => {
	const service = new JsxRuntimeBundleService({ radiant: false, rootDir: repoRoot });
	const specifierMap = await service.getSpecifierMap();
	const dependencies = await service.getDependencies();

	assert.equal('@ecopages/radiant' in specifierMap, false);
	assert.equal('@ecopages/radiant/client/hydrator' in specifierMap, false);
	assert.equal('@ecopages/radiant/client/install-hydrator' in specifierMap, false);
	assert.equal(
		dependencies.some(
			(dependency) => dependency.source === 'node-module' && dependency.name === 'ecopages-radiant-esm',
		),
		false,
	);
});
