import { isDevelopmentRuntime } from '@ecopages/core/integration';

type LitCustomElementDefinition = {
	ctor: CustomElementConstructor;
};

type LitSsrCustomElementRegistry = CustomElementRegistry & {
	__definitions: Map<string, LitCustomElementDefinition>;
	__reverseDefinitions: Map<object, string>;
};

const patchedRegistries = new WeakSet<object>();

function isLitSsrCustomElementRegistry(registry: CustomElementRegistry): registry is LitSsrCustomElementRegistry {
	return (
		'__definitions' in registry &&
		registry.__definitions instanceof Map &&
		'__reverseDefinitions' in registry &&
		registry.__reverseDefinitions instanceof Map
	);
}

/**
 * Replaces one Lit SSR custom-element definition so development reloads can register again.
 *
 * @remarks
 * Lit's SSR registry warns on a second `define` and does not expose `delete`.
 * The previous constructor is dropped only for the duration of the replacement
 * `define`. If that call throws, the previous definition is restored so a failed
 * reload does not leave the tag unregistered.
 */
function replaceLitSsrCustomElementDefinition(
	registry: LitSsrCustomElementRegistry,
	originalDefine: CustomElementRegistry['define'],
	name: string,
	constructor: CustomElementConstructor,
	options?: ElementDefinitionOptions,
): void {
	const existing = registry.__definitions.get(name);
	if (!existing) {
		originalDefine.call(registry, name, constructor, options);
		return;
	}

	registry.__definitions.delete(name);
	registry.__reverseDefinitions.delete(existing.ctor);

	try {
		originalDefine.call(registry, name, constructor, options);
	} catch (error) {
		registry.__definitions.set(name, existing);
		registry.__reverseDefinitions.set(existing.ctor, name);
		throw error;
	}
}

/**
 * Lets development reloads re-register a tag on Lit's SSR registry.
 *
 * @remarks
 * Installed only on Lit's SSR `CustomElementRegistry` after the DOM shim exists.
 * Development reloads replace the previous definition, then call the original
 * `define`. If that replacement throws, the previous definition is restored.
 * Other environments keep the registry's own `define` behavior, which throws in
 * production.
 */
export function installLitCustomElementDefinePolicy(): void {
	const registry = globalThis.customElements;
	if (!registry || patchedRegistries.has(registry) || !isLitSsrCustomElementRegistry(registry)) {
		return;
	}

	patchedRegistries.add(registry);
	const originalDefine = registry.define;

	registry.define = function litDefine(
		name: string,
		constructor: CustomElementConstructor,
		options?: ElementDefinitionOptions,
	): void {
		if (isDevelopmentRuntime() && registry.get(name)) {
			replaceLitSsrCustomElementDefinition(registry, originalDefine, name, constructor, options);
			return;
		}

		originalDefine.call(registry, name, constructor, options);
	};
}
