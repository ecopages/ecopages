import { describe, expect, it } from 'vitest';
import { defineDevTool } from './define-dev-tool.ts';

describe('defineDevTool', () => {
	it('accepts a package name string', () => {
		expect(defineDevTool('@ecopages/dev-toolbar')).toEqual({
			package: '@ecopages/dev-toolbar',
		});
	});

	it('accepts an options object', () => {
		expect(
			defineDevTool({
				package: '@acme/dev-toolbar',
				enabled: false,
			}),
		).toEqual({
			package: '@acme/dev-toolbar',
			enabled: false,
		});
	});
});
