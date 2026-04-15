import { describe, expect, it } from 'vitest';
import { eco } from '@ecopages/core';
import { ReactPlugin } from './react.plugin.ts';

describe('ReactPlugin', () => {
	it('should expose runtime specifier mappings through the base integration hook', () => {
		const plugin = new ReactPlugin();

		expect(plugin.getRuntimeSpecifierMap()).toMatchObject({
			react: '/assets/vendors/react.js',
			'react-dom/client': '/assets/vendors/react-dom.js',
		});
	});
});
