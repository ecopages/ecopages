import { describe, expect, test } from 'vitest';
import {
	DEFAULT_BUILD_OUTPUTS,
	findTemplate,
	readTemplateManifest,
	templateBuildOutputs,
} from './template-manifest.ts';

describe('templateBuildOutputs', () => {
	test('defaults to the client index page', () => {
		expect(templateBuildOutputs({ id: 'x' })).toEqual(DEFAULT_BUILD_OUTPUTS);
	});

	test('reads the outputs a template declares', () => {
		const buildOutputs = ['dist/client/index.html', 'dist/client/collections/living/index.html'];

		expect(templateBuildOutputs({ id: 'x', buildOutputs })).toEqual(buildOutputs);
	});

	test('rejects a declaration that is not a non-empty list of paths under dist', () => {
		for (const buildOutputs of [[], 'dist/client/index.html', ['src/pages/index.tsx'], ['dist/../src/x'], [1]]) {
			expect(() => templateBuildOutputs({ id: 'x', buildOutputs })).toThrow(/buildOutputs/u);
		}
	});

	test('every entry in the official manifest declares valid outputs', () => {
		for (const template of readTemplateManifest().templates) {
			expect(templateBuildOutputs(template).length).toBeGreaterThan(0);
		}
	});

	test('findTemplate refuses an id the manifest does not list', () => {
		expect(findTemplate(readTemplateManifest(), 'eco-commerce').source).toBe('eco-commerce');
		expect(() => findTemplate(readTemplateManifest(), 'no-such-template')).toThrow(/no-such-template/u);
	});
});
