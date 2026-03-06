import { describe, expect, test } from 'vitest';
import { createIslandHydrationScript } from './hydration-scripts.ts';

describe('createIslandHydrationScript', () => {
	const baseOptions = {
		importPath: '/assets/component.js',
		reactImportPath: '/assets/react.js',
		reactDomClientImportPath: '/assets/react-dom-client.js',
		targetSelector: '[data-eco-component-id="eco-component-1"]',
		props: { count: 3 },
		componentRef: 'component-ref',
		componentFile: '/app/component.tsx',
	};

	test('development output mounts on initial load and after swap', () => {
		const script = createIslandHydrationScript({
			...baseOptions,
			isDevelopment: true,
		});

		expect(script).toContain('document.addEventListener("eco:after-swap", mount);');
		expect(script).toContain('target.hasAttribute("data-eco-react-mounted")');
		expect(script).toContain('target.setAttribute("data-eco-react-mounted", "true")');
		expect(script).toContain('document.addEventListener("DOMContentLoaded", mount, { once: true });');
	});

	test('production output mounts on initial load and after swap', () => {
		const script = createIslandHydrationScript({
			...baseOptions,
			isDevelopment: false,
		});

		expect(script).toContain('document.addEventListener("eco:after-swap",m)');
		expect(script).toContain('hasAttribute("data-eco-react-mounted")');
		expect(script).toContain('setAttribute("data-eco-react-mounted","true")');
		expect(script).toContain('DOMContentLoaded",m,{once:true}');
	});
});
