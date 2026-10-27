import { installWindowOnGlobal } from '@lit-labs/ssr/lib/dom-shim.js';
import '@lit-labs/ssr/lib/install-global-dom-shim.js';
import { installLitCustomElementDefinePolicy } from './custom-element-define.ts';

/**
 * Repairs the minimal Lit DOM surface after another Integration installs its SSR globals.
 *
 * @remarks
 * The shim is installed only while no global custom element registry exists.
 * `installWindowOnGlobal()` copies `window: undefined` onto the global, so a
 * `window` check never turns true and every call would swap in a fresh
 * registry, dropping elements that preloaded SSR scripts already defined.
 * After the registry exists, this also installs the development re-registration
 * policy on Lit's SSR `CustomElementRegistry`.
 */
export function ensureLitDomShim(): void {
	if (typeof globalThis.customElements === 'undefined') {
		installWindowOnGlobal();
	}

	if (typeof globalThis.document !== 'undefined' && typeof globalThis.document.createTreeWalker !== 'function') {
		Object.defineProperty(globalThis.document, 'createTreeWalker', {
			configurable: true,
			writable: true,
			value: () => ({}),
		});
	}

	for (const target of [globalThis.Element, globalThis.HTMLElement]) {
		if (typeof target === 'undefined' || !target?.prototype) {
			continue;
		}

		if (!('attributes' in target.prototype)) {
			Object.defineProperty(target.prototype, 'attributes', {
				configurable: true,
				enumerable: true,
				get() {
					if (typeof this.getAttributeNames === 'function') {
						return this.getAttributeNames().map((name: string) => ({
							name,
							value: this.getAttribute(name),
						}));
					}
					return [];
				},
			});
		}

		if (typeof target.prototype.attachShadow !== 'function') {
			Object.defineProperty(target.prototype, 'attachShadow', {
				configurable: true,
				writable: true,
				value: function attachShadow(init: ShadowRootInit = { mode: 'open' }) {
					const shadowRoot = {
						mode: init?.mode ?? 'open',
						host: this,
						children: [],
						childNodes: [],
					};
					(this as { shadowRoot?: unknown }).shadowRoot = shadowRoot;
					return shadowRoot;
				},
			});
		}
	}

	installLitCustomElementDefinePolicy();
}

ensureLitDomShim();
