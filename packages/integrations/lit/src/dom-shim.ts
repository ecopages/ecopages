import { installWindowOnGlobal } from '@lit-labs/ssr/lib/dom-shim.js';
import '@lit-labs/ssr/lib/install-global-dom-shim.js';

/** Repairs the minimal Lit DOM surface after another Integration installs its SSR globals. */
export function ensureLitDomShim(): void {
if (typeof globalThis.document?.createTreeWalker !== 'function') {
	if (typeof globalThis.window === 'undefined') {
		installWindowOnGlobal();
	} else {
		Object.defineProperty(globalThis.document, 'createTreeWalker', {
			configurable: true,
			writable: true,
			value: () => ({}),
		});
	}
}
}

ensureLitDomShim();
