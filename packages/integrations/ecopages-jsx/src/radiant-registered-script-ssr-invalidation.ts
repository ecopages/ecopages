import { existsSync, readFileSync } from 'node:fs';

const CUSTOM_ELEMENT_TAG_PATTERN = /@customElement\s*\(\s*['"`]([^'"`]+)['"`]/u;

type CustomElementRegistryLike = {
	get(name: string): unknown;
	delete?: (name: string) => boolean;
	definitions?: Map<string, unknown>;
};

/**
 * Reads the custom-element tag name from a registered script module source file.
 */
export function resolveRadiantCustomElementTag(scriptPath: string): string | undefined {
	if (!existsSync(scriptPath)) {
		return undefined;
	}

	const content = readFileSync(scriptPath, 'utf8');
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
export function clearRadiantCustomElementDefinition(tagName: string): void {
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
 * Clears the SSR custom-element registry entry for one registered Radiant script module.
 */
export function invalidateRadiantRegisteredScriptSsrRegistration(scriptPath: string): boolean {
	const tagName = resolveRadiantCustomElementTag(scriptPath);
	if (!tagName) {
		return false;
	}

	clearRadiantCustomElementDefinition(tagName);
	return true;
}
