import { fileSystem } from '@ecopages/file-system';

const CUSTOM_ELEMENT_TAG_PATTERN = /@customElement\s*\(\s*['"`]([^'"`]+)['"`]/u;

type CustomElementRegistryLike = {
	get(name: string): unknown;
	delete?: (name: string) => boolean;
	definitions?: Map<string, unknown>;
};

/**
 * Reads the custom-element tag name from a registered script module source file.
 */
export function resolveRegisteredScriptCustomElementTag(scriptPath: string): string | undefined {
	if (!fileSystem.exists(scriptPath)) {
		return undefined;
	}

	const content = fileSystem.readFileSync(scriptPath);
	const match = content.match(CUSTOM_ELEMENT_TAG_PATTERN);

	return match?.[1];
}

/**
 * Removes one custom-element definition from the active runtime registry.
 *
 * @remarks
 * Radiant's `@customElement` decorator and the SSR light-DOM shim both skip
 * re-registration when a tag is already defined. During dev, server requests
 * reuse the same process-global registry, so script edits would otherwise keep
 * serving stale SSR markup until a full dev-server restart.
 */
export function clearRegisteredCustomElementDefinition(tagName: string): void {
	const registry = (globalThis as { customElements?: CustomElementRegistryLike }).customElements;
	if (!registry) {
		return;
	}

	if (typeof registry.delete === 'function') {
		registry.delete(tagName);
		return;
	}

	const definitions = registry.definitions;
	if (definitions instanceof Map && definitions.has(tagName)) {
		definitions.delete(tagName);
	}
}

/**
 * Clears the SSR custom-element registry entry for one registered script module.
 */
export function invalidateRegisteredScriptSsrRegistration(scriptPath: string): void {
	const tagName = resolveRegisteredScriptCustomElementTag(scriptPath);
	if (!tagName) {
		return;
	}

	clearRegisteredCustomElementDefinition(tagName);
}
