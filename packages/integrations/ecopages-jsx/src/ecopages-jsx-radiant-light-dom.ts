type RadiantLightDomShimWindow = {
	CSS: { escape(value: string): string };
	CustomEvent: typeof CustomEvent;
	Document: typeof Document;
	Element: typeof Element;
	Event: typeof Event;
	EventTarget: typeof EventTarget;
	HTMLScriptElement: typeof HTMLScriptElement;
	HTMLElement: typeof HTMLElement;
	Node: typeof Node;
	document: Document;
	customElements: CustomElementRegistry;
	requestAnimationFrame: typeof requestAnimationFrame;
	cancelAnimationFrame: typeof cancelAnimationFrame;
};

/**
 * Installs Radiant light-DOM constructors on `globalThis` when no registry exists.
 *
 * @remarks
 * Custom-element constructors are process-global. Replacing an existing
 * `customElements` registry drops elements another Integration already defined,
 * so this is a no-op when a registry is present. Core installs the complete
 * surface at Integration setup, before any element is defined.
 */
export function ensureRadiantLightDomGlobals(ensureLightDomShim: () => RadiantLightDomShimWindow | undefined): void {
	if (typeof globalThis.customElements?.define === 'function') {
		return;
	}

	const window = ensureLightDomShim();
	if (!window) {
		return;
	}

	Object.assign(globalThis, {
		CSS: window.CSS,
		CustomEvent: window.CustomEvent,
		Document: window.Document,
		Element: window.Element,
		Event: window.Event,
		EventTarget: window.EventTarget,
		HTMLScriptElement: window.HTMLScriptElement,
		HTMLElement: window.HTMLElement,
		Node: window.Node,
		document: window.document,
		customElements: window.customElements,
		requestAnimationFrame: window.requestAnimationFrame,
		cancelAnimationFrame: window.cancelAnimationFrame,
		window,
	});
}

/**
 * Loads Radiant's light-DOM shim and SSR runtime, installing constructors when
 * `globalThis` has no registry.
 *
 * @remarks
 * `@ecopages/radiant/server/radiant-element-ssr` calls `installLightDomShim()`
 * while the module evaluates. That installer replaces a partial Lit surface,
 * including `customElements`. The existing registry is restored afterwards so
 * elements another Integration already defined stay registered.
 */
export async function installRadiantServerDom(): Promise<void> {
	const radiantLightDomShimEntry = import.meta.resolve('@ecopages/radiant/server/light-dom-shim');
	const radiantElementSsrRuntimeModuleUrl = import.meta.resolve('@ecopages/radiant/server/radiant-element-ssr');
	const lightDomShimModule = await import(/* @vite-ignore */ radiantLightDomShimEntry);
	ensureRadiantLightDomGlobals(lightDomShimModule.ensureLightDomShim);
	const registry = globalThis.customElements;
	await import(/* @vite-ignore */ radiantElementSsrRuntimeModuleUrl);
	restoreCustomElementRegistry(registry);
}

function restoreCustomElementRegistry(registry: CustomElementRegistry | undefined): void {
	if (!registry || globalThis.customElements === registry) {
		return;
	}

	Object.assign(globalThis, { customElements: registry });
	const window = (globalThis as { window?: { customElements?: CustomElementRegistry } }).window;
	if (window) {
		window.customElements = registry;
	}
}
