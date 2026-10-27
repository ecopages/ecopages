import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

describe('Lit Integration console.warn', () => {
	it('leaves console.warn unchanged when the Integration is imported', async () => {
		const originalWarn = console.warn;

		await import('../lit.plugin.ts');

		expect(console.warn).toBe(originalWarn);
	});
});

describe('Lit custom element registration', () => {
	beforeAll(async () => {
		await import('@lit-labs/ssr/lib/install-global-dom-shim.js');
	});

	afterEach(() => {
		vi.unstubAllEnvs();
		vi.restoreAllMocks();
	});

	it('reports a duplicate definition in production', async () => {
		vi.stubEnv('NODE_ENV', 'production');
		const { ensureLitDomShim } = await import('../dom-shim.ts');
		ensureLitDomShim();

		const tagName = `lit-duplicate-production-${crypto.randomUUID()}`;
		customElements.define(tagName, class extends HTMLElement {});

		expect(() => customElements.define(tagName, class extends HTMLElement {})).toThrow(
			`Failed to execute 'define' on 'CustomElementRegistry': the name "${tagName}" has already been used with this registry`,
		);
	});

	it('logs no duplicate-definition warning when a Lit element is defined again in development', async () => {
		vi.stubEnv('NODE_ENV', 'development');
		const { ensureLitDomShim } = await import('../dom-shim.ts');
		ensureLitDomShim();

		const warn = vi.spyOn(console, 'warn');
		const tagName = `lit-duplicate-development-${crypto.randomUUID()}`;
		class FirstElement extends HTMLElement {}
		class ReloadedElement extends HTMLElement {}

		customElements.define(tagName, FirstElement);
		customElements.define(tagName, ReloadedElement);

		expect(warn.mock.calls.flat().join('\n')).not.toContain("'CustomElementRegistry' already has");
		expect(customElements.get(tagName)).toBe(ReloadedElement);
	});

	it('keeps the previous definition when a development replacement is rejected', async () => {
		vi.stubEnv('NODE_ENV', 'development');
		const { ensureLitDomShim } = await import('../dom-shim.ts');
		ensureLitDomShim();

		const firstTag = `lit-keep-first-${crypto.randomUUID()}`;
		const otherTag = `lit-keep-other-${crypto.randomUUID()}`;
		class FirstElement extends HTMLElement {}
		class OtherElement extends HTMLElement {}

		customElements.define(firstTag, FirstElement);
		customElements.define(otherTag, OtherElement);

		expect(() => customElements.define(firstTag, OtherElement)).toThrow(
			/the constructor has already been used with this registry/,
		);
		expect(customElements.get(firstTag)).toBe(FirstElement);
		expect(customElements.get(otherTag)).toBe(OtherElement);
	});
});
