import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { test } from 'vitest';
import type { EcoBuildOnResolveResult } from '../../../../core/src/build/build-types.ts';
import type { InlineContentScriptAsset } from '../../../../core/src/services/assets/asset-processing-service/assets.types.ts';
import {
	collectRuntimeSpecifierAliasMap,
	rewriteRuntimeSpecifierAliases,
} from '../../../../core/src/build/runtime-specifier-aliases.ts';
import { JsxRuntimeBundleService, RADIANT_HYDRATOR_BOOTSTRAP_ATTRIBUTE } from './jsx-runtime-bundle.service.ts';

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
		rewriteRuntimeSpecifierAliases(
			'import { RadiantComponent } from "@ecopages/radiant";\nimport { installRadiantHydrator } from "@ecopages/radiant/client/hydrator";\nimport { jsx } from "@ecopages/jsx/jsx-runtime";',
			aliasMap,
		),
		[
			`import { RadiantComponent } from "${specifierMap['@ecopages/radiant']}";`,
			`import { installRadiantHydrator } from "${specifierMap['@ecopages/radiant/client/hydrator']}";`,
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
	assert.equal(specifierMap['@ecopages/radiant/core/radiant-element'], '/assets/vendors/ecopages-radiant-esm.js');
	assert.equal('@ecopages/radiant/client/install-hydrator' in specifierMap, false);
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
	const radiantBootstrapDependency = dependencies.find(
		(dependency): dependency is InlineContentScriptAsset =>
			dependency.kind === 'script' &&
			dependency.source === 'content' &&
			dependency.inline === true &&
			dependency.attributes?.[RADIANT_HYDRATOR_BOOTSTRAP_ATTRIBUTE] === 'true',
	);

	assert.ok(jsxDependency && jsxDependency.source === 'node-module');
	assert.match(jsxDependency.importPath, /ecopages-jsx-esm-entry\.mjs$/);

	const jsxEntrySource = readFileSync(jsxDependency.importPath, 'utf8');

	assert.match(jsxEntrySource, /eopCanonicalSvgLocalNames/);
	assert.match(jsxEntrySource, /lineargradient:'linearGradient'/);
	assert.match(jsxEntrySource, /fedropshadow:'feDropShadow'/);
	assert.match(jsxEntrySource, /eopRepairNamespaceChildren/);
	assert.doesNotMatch(jsxEntrySource, /assets\/vendors\/ecopages-jsx-esm/);
	assert.doesNotMatch(jsxEntrySource, /@ecopages\/jsx\/server/);

	assert.ok(radiantBootstrapDependency);
	assert.equal(radiantBootstrapDependency.position, 'head');
	assert.equal(radiantBootstrapDependency.attributes?.type, 'module');
	assert.match(
		radiantBootstrapDependency.content,
		/import \{ installRadiantHydrator \} from '@ecopages\/radiant\/client\/hydrator';/,
	);
	assert.match(radiantBootstrapDependency.content, /installRadiantHydrator\(\);/);

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
	assert.equal(
		dependencies.some(
			(dependency) =>
				dependency.kind === 'script' &&
				dependency.source === 'content' &&
				dependency.attributes?.[RADIANT_HYDRATOR_BOOTSTRAP_ATTRIBUTE] === 'true',
		),
		false,
	);
	assert.equal(
		dependencies.some(
			(dependency) => dependency.source === 'node-module' && dependency.name === 'ecopages-radiant-esm',
		),
		false,
	);
});
