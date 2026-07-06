import { createMarkupNodeLike } from '@ecopages/jsx';
import { createServerHydrationBindingState, withServerHydrationBindingState } from '@ecopages/jsx/server';

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
};

type RadiantServerRuntimeModules = {
	installLightDomShim: () => RadiantLightDomShimWindow;
	resolveRadiantElementRenderBridge: (instance: unknown) =>
		| {
				renderHost: () => { nodeType: 1; outerHTML: string };
				renderHostToString: (options?: unknown) => string;
		  }
		| undefined;
	withServerRadiantElementSsrRuntime: <T>(render: () => T) => T;
};

/**
 * Owns optional Radiant SSR runtime installation for the JSX integration.
 *
 * @remarks
 * Radiant's server bridge and light-DOM shim are loaded lazily because most JSX
 * renders do not need them. Once enabled, the resolved runtime modules are
 * cached statically so repeated page and component renders do not keep paying
 * module-resolution or shim-installation costs.
 */
export class EcopagesJsxRadiantSsrPolicy {
	private static runtimeModules: RadiantServerRuntimeModules | undefined;
	private static runtimeModulesPromise:
		| Promise<{
				installLightDomShim: () => RadiantLightDomShimWindow;
				withServerRadiantElementSsrRuntime: <T>(render: () => T) => T;
		  }>
		| undefined;

	private readonly enabled: boolean;

	constructor(enabled: boolean) {
		this.enabled = enabled;
	}

	/**
	 * Ensures the Radiant SSR runtime is installed before a render needs it.
	 */
	async prepareRuntime(): Promise<void> {
		if (!this.enabled) {
			return;
		}

		await this.ensureRuntimeInstalled();
	}

	/**
	 * Runs one render inside Radiant's server runtime when the policy is enabled.
	 */
	async withRuntime<T>(render: () => T): Promise<T> {
		if (!this.enabled) {
			return render();
		}

		const runtimeModules = await EcopagesJsxRadiantSsrPolicy.runtimeModulesPromise;
		if (!runtimeModules) {
			return render();
		}

		return runtimeModules.withServerRadiantElementSsrRuntime(render);
	}

	/**
	 * Converts one Radiant custom-element instance into trusted SSR markup.
	 *
	 * @remarks
	 * The returned node-like wrapper lets the JSX server renderer preserve the
	 * generated host HTML without escaping it back into plain text.
	 */
	renderIntrinsicElementMarkup(instance: unknown): ReturnType<typeof createMarkupNodeLike> | undefined {
		const renderBridge = EcopagesJsxRadiantSsrPolicy.runtimeModules?.resolveRadiantElementRenderBridge(instance);
		if (!renderBridge) {
			return undefined;
		}

		return createMarkupNodeLike(
			withServerHydrationBindingState(createServerHydrationBindingState(), () =>
				renderBridge.renderHostToString({
					mode: 'hydrate',
				}),
			),
		);
	}

	private async ensureRuntimeInstalled(): Promise<void> {
		if (!EcopagesJsxRadiantSsrPolicy.runtimeModulesPromise) {
			const radiantLightDomShimEntry = import.meta.resolve('@ecopages/radiant/server/light-dom-shim');
			const radiantElementSsrRuntimeModuleUrl = new URL(
				'./radiant-element-ssr-bridge.js',
				radiantLightDomShimEntry,
			).href;

			EcopagesJsxRadiantSsrPolicy.runtimeModulesPromise = (async () => {
				const lightDomShimModule = await import(radiantLightDomShimEntry);
				ensureRadiantLightDomGlobals(lightDomShimModule.installLightDomShim);

				const radiantElementSsrRuntimeModule = (await import(radiantElementSsrRuntimeModuleUrl)) as {
					resolveRadiantElementRenderBridge: (instance: unknown) =>
						| {
								renderHost: () => { nodeType: 1; outerHTML: string };
								renderHostToString: (options?: unknown) => string;
						  }
						| undefined;
					withServerRadiantElementSsrRuntime: <T>(render: () => T) => T;
				};

				const modules = {
					installLightDomShim: lightDomShimModule.installLightDomShim,
					resolveRadiantElementRenderBridge: radiantElementSsrRuntimeModule.resolveRadiantElementRenderBridge,
					withServerRadiantElementSsrRuntime:
						radiantElementSsrRuntimeModule.withServerRadiantElementSsrRuntime,
				};

				EcopagesJsxRadiantSsrPolicy.runtimeModules = modules;
				return modules;
			})();
		}

		await EcopagesJsxRadiantSsrPolicy.runtimeModulesPromise;

		const lightDomShimModule = EcopagesJsxRadiantSsrPolicy.runtimeModules;
		if (lightDomShimModule) {
			ensureRadiantLightDomGlobals(lightDomShimModule.installLightDomShim);
		}
	}
}

function ensureRadiantLightDomGlobals(installLightDomShim: () => RadiantLightDomShimWindow): void {
	if (typeof globalThis.HTMLElement !== 'undefined') {
		return;
	}

	const window = installLightDomShim();
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
		window,
	});
}
