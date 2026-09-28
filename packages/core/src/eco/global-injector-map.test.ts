import { describe, expect, test } from 'vitest';
import { buildGlobalInjectorBootstrapContent, buildGlobalInjectorMapScript } from './global-injector-map.ts';
import type { ResolvedLazyTrigger } from '../types/public-types.ts';

describe('buildGlobalInjectorMapScript', () => {
	test('builds merged map by trigger id and escapes script closing tags', () => {
		const triggers: ResolvedLazyTrigger[] = [
			{
				triggerId: 'eco-trigger-one',
				rules: [
					{ 'on:interaction': { value: 'click', scripts: ['/a.js', '/b</script>.js'] } },
					{ 'on:idle': { scripts: ['/idle.js'] } },
				],
			},
			{
				triggerId: 'eco-trigger-one',
				rules: [{ 'on:interaction': { value: 'click', scripts: ['/a.js', '/c.js'] } }],
			},
		];

		const payload = buildGlobalInjectorMapScript(triggers);
		expect(payload).toContain('<\\/script>');

		const map = JSON.parse(payload) as Record<string, Record<string, { scripts: string[]; value?: string }>>;
		expect(map['eco-trigger-one']?.['on:idle']?.scripts).toEqual(['/idle.js']);
		expect(map['eco-trigger-one']?.['on:interaction']).toEqual({
			value: 'click',
			scripts: ['/a.js', '/b</script>.js', '/c.js'],
		});
	});
});

describe('buildGlobalInjectorBootstrapContent', () => {
	test('binds refresh to after-swap and avoids before-swap cleanup listener', () => {
		const bootstrap = buildGlobalInjectorBootstrapContent('/assets/injector-global.js');

		expect(bootstrap).toContain("document.addEventListener('eco:after-swap', handleAfterSwap);");
		expect(bootstrap).not.toContain("document.addEventListener('eco:before-swap'");
		expect(bootstrap).not.toContain('const handleBeforeSwap');
		expect(bootstrap).toContain("document.removeEventListener('eco:after-swap', handleAfterSwap);");
	});
});
