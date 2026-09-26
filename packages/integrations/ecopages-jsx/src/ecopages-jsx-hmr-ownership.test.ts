import { beforeEach, describe, expect, it } from 'vitest';
import type { EcoComponent, EcoComponentConfig } from '@ecopages/core';
import {
	getEjsxHmrOwnership,
	recordEjsxHmrOwnership,
	resetEjsxHmrOwnership,
	withEjsxHmrOwnershipScope,
} from './ecopages-jsx-hmr-ownership.ts';

const PAGE_FILE = '/test/project/src/pages/docs/[...slug]/index.tsx';
const MDX_FILE = '/test/project/src/content/docs/intro.mdx';

function makeComponent(file: string): EcoComponent {
	const fn = (() => undefined) as unknown as EcoComponent;
	(fn as { config?: EcoComponentConfig }).config = {
		identity: {
			id: `id-${file}`,
			file,
			integration: 'ecopages-jsx',
		},
	};
	return fn;
}

describe('withEjsxHmrOwnershipScope', () => {
	beforeEach(() => {
		resetEjsxHmrOwnership();
	});

	it('publishes the merged ownership once the outermost scope completes', async () => {
		await withEjsxHmrOwnershipScope(async () => {
			recordEjsxHmrOwnership([makeComponent(PAGE_FILE)]);
			await withEjsxHmrOwnershipScope(async () => {
				recordEjsxHmrOwnership([makeComponent(MDX_FILE)]);
			});
			expect(getEjsxHmrOwnership().fileOwners.size).toBe(0);
		});

		expect([...getEjsxHmrOwnership().fileOwners].sort()).toEqual([MDX_FILE, PAGE_FILE].sort());
	});

	it('rejects recording outside a render scope', () => {
		expect(() => recordEjsxHmrOwnership([makeComponent(PAGE_FILE)])).toThrow(/inside an active render scope/);
	});
});
