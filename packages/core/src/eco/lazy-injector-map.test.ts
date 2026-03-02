import { describe, expect, test } from 'vitest';
import { buildInjectorMapScript } from './lazy-injector-map.ts';
import type { InjectorMapConfig } from '@ecopages/scripts-injector/types';
import type { ResolvedLazyScriptGroup } from '../public-types.ts';

describe('buildInjectorMapScript', () => {
	test('builds injector map for mixed lazy triggers', () => {
		const lazyGroups: ResolvedLazyScriptGroup[] = [
			{ lazy: { 'on:idle': true }, scripts: './idle-a.js, /idle-b.js' },
			{ lazy: { 'on:interaction': 'click' }, scripts: './int-a.js' },
			{ lazy: { 'on:visible': '0.5' }, scripts: '/vis-a.js' },
		];

		const result = buildInjectorMapScript(lazyGroups);
		const map = JSON.parse(result) as InjectorMapConfig;

		expect(map['on:idle']).toEqual({ scripts: ['/idle-a.js', '/idle-b.js'] });
		expect(map['on:interaction']).toEqual({
			value: 'click',
			scripts: ['/int-a.js'],
		});
		expect(map['on:visible']).toEqual({
			value: '0.5',
			scripts: ['/vis-a.js'],
		});
	});

	test('dedupes scripts and merges interaction events while preserving order', () => {
		const lazyGroups: ResolvedLazyScriptGroup[] = [
			{ lazy: { 'on:interaction': 'click,mouseenter' }, scripts: './one.js,./two.js' },
			{ lazy: { 'on:interaction': 'mouseenter,focusin' }, scripts: '/two.js,/three.js' },
		];

		const result = buildInjectorMapScript(lazyGroups);
		const map = JSON.parse(result) as InjectorMapConfig;

		expect(map['on:interaction']).toEqual({
			value: 'click,mouseenter,focusin',
			scripts: ['/one.js', '/two.js', '/three.js'],
		});
	});

	test('keeps existing on:visible threshold when a later boolean trigger is encountered', () => {
		const lazyGroups: ResolvedLazyScriptGroup[] = [
			{ lazy: { 'on:visible': '100px' }, scripts: './threshold.js' },
			{ lazy: { 'on:visible': true }, scripts: './fallback.js' },
		];

		const result = buildInjectorMapScript(lazyGroups);
		const map = JSON.parse(result) as InjectorMapConfig;

		expect(map['on:visible']).toEqual({
			value: '100px',
			scripts: ['/threshold.js', '/fallback.js'],
		});
	});

	test('escapes closing script tags in output payload', () => {
		const lazyGroups: ResolvedLazyScriptGroup[] = [
			{ lazy: { 'on:idle': true }, scripts: '/safe.js, /x</script>y.js' },
		];

		const result = buildInjectorMapScript(lazyGroups);
		expect(result).toContain('<\\/script>');
	});
});
