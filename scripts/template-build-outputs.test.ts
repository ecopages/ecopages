import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, test } from 'vitest';
import { DEFAULT_BUILD_OUTPUTS, templateBuildOutputs } from './template-build-outputs.ts';

describe('templateBuildOutputs', () => {
	test('defaults to the client index page', () => {
		expect(templateBuildOutputs({ id: 'x' })).toEqual(DEFAULT_BUILD_OUTPUTS);
	});

	test('reads the outputs a template declares', () => {
		const buildOutputs = ['dist/client/index.html', 'dist/client/collections/living/index.html'];

		expect(templateBuildOutputs({ id: 'x', buildOutputs })).toEqual(buildOutputs);
	});

	test('rejects a declaration that is not a non-empty list of paths under dist', () => {
		for (const buildOutputs of [[], 'dist/client/index.html', ['src/pages/index.tsx'], [1]]) {
			expect(() => templateBuildOutputs({ id: 'x', buildOutputs })).toThrow(/buildOutputs/u);
		}
	});

	test('every entry in the official manifest declares valid outputs', () => {
		const manifest = JSON.parse(
			readFileSync(path.resolve(import.meta.dirname, '../packages/ecopages/templates.json'), 'utf8'),
		) as { templates: Array<{ id: string; buildOutputs?: unknown }> };

		for (const template of manifest.templates) expect(templateBuildOutputs(template).length).toBeGreaterThan(0);
	});
});
