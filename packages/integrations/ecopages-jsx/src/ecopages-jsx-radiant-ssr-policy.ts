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
	requestAnimationFrame: typeof requestAnimationFrame;
	cancelAnimationFrame: typeof cancelAnimationFrame;
};

type RadiantServerRuntimeModules = {
	ensureLightDomShim: () => RadiantLightDomShimWindow | undefined;
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
 * renders do not need them. Resolved runtime modules are cached on the policy
 * instance so repeated renders on the same renderer reuse one load without
 * process-wide mutable class state. Light-DOM constructor installation remains
 * process-global and idempotent via {@link ensureRadiantLightDomGlobals}; the
 * Radiant installer also repairs incomplete DOM globals left by another runtime.
 */
export class EcopagesJsxRadiantSsrPolicy {
	private runtimeModules: RadiantServerRuntimeModules | undefined;
	private runtimeModulesPromise:
		| Promise<{
				ensureLightDomShim: () => RadiantLightDomShimWindow | undefined;
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

		const runtimeModules = await this.runtimeModulesPromise;
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
		const renderBridge = this.runtimeModules?.resolveRadiantElementRenderBridge(instance);
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
		if (!this.runtimeModulesPromise) {
			const radiantLightDomShimEntry = import.meta.resolve('@ecopages/radiant/server/light-dom-shim');
			const radiantElementSsrRuntimeModuleUrl = new URL(
				'./radiant-element-ssr-bridge.js',
				radiantLightDomShimEntry,
			).href;

			this.runtimeModulesPromise = (async () => {
				const lightDomShimModule = await import(radiantLightDomShimEntry);
				ensureRadiantLightDomGlobals(lightDomShimModule.ensureLightDomShim);

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
					ensureLightDomShim: lightDomShimModule.ensureLightDomShim,
					resolveRadiantElementRenderBridge: radiantElementSsrRuntimeModule.resolveRadiantElementRenderBridge,
					withServerRadiantElementSsrRuntime:
						radiantElementSsrRuntimeModule.withServerRadiantElementSsrRuntime,
				};

				this.runtimeModules = modules;
				return modules;
			})();
		}

		await this.runtimeModulesPromise;

		const lightDomShimModule = this.runtimeModules;
		if (lightDomShimModule) {
			ensureRadiantLightDomGlobals(lightDomShimModule.ensureLightDomShim);
		}
	}
}

/**
 * Installs Radiant light-DOM constructors on `globalThis` once.
 *
 * @remarks
 * Custom-element constructors must be process-global; undoing them between tests
 * is unsafe. Callers that clear globals for isolation must rely on a fresh policy
 * instance so {@link EcopagesJsxRadiantSsrPolicy.prepareRuntime} re-runs the
 * completeness check.
 */
function ensureRadiantLightDomGlobals(ensureLightDomShim: () => RadiantLightDomShimWindow | undefined): void {
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
