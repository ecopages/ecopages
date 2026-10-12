import { ECO_PERSIST_ATTRIBUTE } from '../navigation-attributes.ts';
import { isNonExecutableHeadScript, isRerunScript } from './classification.ts';

let navigationScriptGeneration = 0;

export type ScriptActivation = {
	attributes: Iterable<readonly [string, string]>;
	textContent: string;
	insert(script: HTMLScriptElement): void;
	/** Skips the activation when its target left the document while it waited. */
	isDetached?(): boolean;
};

function isActivatableScript(script: HTMLScriptElement): boolean {
	return !isNonExecutableHeadScript(script) && !isRerunScript(script);
}

function isModuleScript(script: HTMLScriptElement): boolean {
	return (script.getAttribute('type') ?? '').trim().toLowerCase() === 'module';
}

/**
 * Returns whether page parsing would stop at `script` until it loads and runs.
 *
 * @remarks
 * Async, deferred, non-JavaScript, and `nomodule` scripts cannot block parsing
 * in the current browser and must not hold later activations.
 */
function isParserBlocking(script: HTMLScriptElement): boolean {
	return (
		script.hasAttribute('src') &&
		!isNonExecutableHeadScript(script) &&
		!isModuleScript(script) &&
		!script.hasAttribute('async') &&
		!script.hasAttribute('defer') &&
		!script.hasAttribute('nomodule')
	);
}

function whenLoaded(script: HTMLScriptElement): Promise<void> {
	return new Promise((resolve) => {
		script.addEventListener('load', () => resolve(), { once: true });
		script.addEventListener('error', () => resolve(), { once: true });
	});
}

/**
 * Inserts fresh copies of `activations` in document order.
 *
 * @remarks
 * Parser-blocking classic scripts wait for load before the sequence advances.
 * Other external scripts keep insertion order, and a newer navigation stops a
 * sequence that is waiting on an earlier script.
 */
export async function activateScriptsInOrder(
	activations: readonly ScriptActivation[],
	isStale: () => boolean = () => false,
): Promise<void> {
	let blockingLoads: Promise<void>[] = [];
	for (const activation of activations) {
		const script = document.createElement('script');
		for (const [name, value] of activation.attributes) {
			script.setAttribute(name, value);
		}
		script.textContent = activation.textContent;

		if (blockingLoads.length > 0) {
			await Promise.all(blockingLoads);
			blockingLoads = [];
			if (isStale()) return;
		}
		if (activation.isDetached?.()) continue;

		if (script.hasAttribute('src') && !script.hasAttribute('async')) {
			script.async = false;
		}
		activation.insert(script);
		if (script.isConnected && isParserBlocking(script)) {
			blockingLoads.push(whenLoaded(script));
		}
	}
}

/**
 * Starts the shared head, rerun, and optional body script queue.
 *
 * @remarks
 * A later call supersedes a queue still waiting on a script load. The calling
 * navigation's own transaction is not consulted because it completes while the
 * queue is still waiting.
 */
export function activateNavigationScripts(
	activations: readonly ScriptActivation[],
	options: { persistAttribute?: string; includeBodyScripts?: boolean } = {},
): void {
	const generation = ++navigationScriptGeneration;
	const bodyActivations = options.includeBodyScripts ? collectBodyScripts(options.persistAttribute) : [];
	void activateScriptsInOrder([...activations, ...bodyActivations], () => generation !== navigationScriptGeneration);
}

/**
 * Returns activations for executable scripts in the live body.
 *
 * @remarks
 * Persisted subtrees stay untouched, while ordinary body scripts run again
 * because each committed body represents a new page visit.
 */
export function collectBodyScripts(persistAttribute: string = ECO_PERSIST_ATTRIBUTE): ScriptActivation[] {
	const persistedSelector = `[${persistAttribute}], [${ECO_PERSIST_ATTRIBUTE}]`;
	return Array.from(document.body.querySelectorAll<HTMLScriptElement>('script'))
		.filter((script) => isActivatableScript(script) && !script.closest(persistedSelector))
		.map((script) => ({
			attributes: Array.from(script.attributes, (attribute): [string, string] => [
				attribute.name,
				attribute.value,
			]),
			textContent: script.textContent ?? '',
			insert: (replacement) => script.replaceWith(replacement),
			isDetached: () => !script.isConnected,
		}));
}
