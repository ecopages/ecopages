import { createMarkupNodeLike } from '@ecopages/jsx';
import { createServerHydrationBindingState, withServerHydrationBindingState } from '@ecopages/jsx/server';

type RadiantServerRuntimeModules = {
	installLightDomShim: () => void;
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
				installLightDomShim: () => void;
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

			EcopagesJsxRadiantSsrPolicy.runtimeModulesPromise = Promise.all([
				import(radiantElementSsrRuntimeModuleUrl) as Promise<{
					resolveRadiantElementRenderBridge: (instance: unknown) =>
						| {
								renderHost: () => { nodeType: 1; outerHTML: string };
								renderHostToString: (options?: unknown) => string;
						  }
						| undefined;
					withServerRadiantElementSsrRuntime: <T>(render: () => T) => T;
				}>,
				import(radiantLightDomShimEntry),
			]).then(([radiantElementSsrRuntimeModule, lightDomShimModule]) => {
				const modules = {
					installLightDomShim: lightDomShimModule.installLightDomShim,
					resolveRadiantElementRenderBridge: radiantElementSsrRuntimeModule.resolveRadiantElementRenderBridge,
					withServerRadiantElementSsrRuntime:
						radiantElementSsrRuntimeModule.withServerRadiantElementSsrRuntime,
				};

				EcopagesJsxRadiantSsrPolicy.runtimeModules = modules;
				return modules;
			});
		}

		const lightDomShimModule = await EcopagesJsxRadiantSsrPolicy.runtimeModulesPromise;
		lightDomShimModule.installLightDomShim();
	}
}
