import { isNonExecutableHeadScript, isRerunScript } from '@ecopages/core/client/navigation-scripts';
import { DEFAULT_PERSIST_ATTR } from './body-morpher.ts';

/**
 * One script to insert as a fresh, executable element.
 */
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
 * `async` and `defer` scripts never block parsing. A browser never fetches a
 * script with a non-JavaScript `type`, nor a `nomodule` script once it supports
 * modules, so neither fires `load` or `error` and waiting on one would never end.
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
 * Inserts fresh copies of `activations` in order, so the browser executes them.
 *
 * @remarks
 * Scripts that come from a parsed document never execute on their own. Each
 * script is inserted only after earlier parser-blocking scripts (external
 * classic scripts without `async`, `defer`, or `nomodule`) have loaded, as page
 * parsing would. External scripts without an author `async` attribute are
 * inserted with `async = false`, so the browser also runs `defer` and module
 * scripts in insertion order. Everything before the first wait runs
 * synchronously, so a queue without parser-blocking scripts is fully inserted
 * when the call returns.
 *
 * @returns Parser-blocking loads still pending at the end, for a later queue to wait on.
 */
export async function activateScriptsInOrder(
	activations: readonly ScriptActivation[],
	pendingLoads: readonly Promise<void>[] = [],
): Promise<Promise<void>[]> {
	let blockingLoads = [...pendingLoads];
	for (const activation of activations) {
		const script = document.createElement('script');
		for (const [name, value] of activation.attributes) {
			script.setAttribute(name, value);
		}
		script.textContent = activation.textContent;

		if (blockingLoads.length > 0) {
			await Promise.all(blockingLoads);
			blockingLoads = [];
		}
		if (activation.isDetached?.()) continue;

		if (script.hasAttribute('src') && !script.hasAttribute('async')) {
			script.async = false;
		}
		if (isParserBlocking(script)) {
			blockingLoads.push(whenLoaded(script));
		}
		activation.insert(script);
	}
	return blockingLoads;
}

/**
 * Returns activations for every executable script in the new body, in document order.
 *
 * @remarks
 * As in Turbo, a body script runs on every navigation that renders it: the body is new
 * content, even when the previous page had an identical script. The exceptions are scripts
 * inside an element marked with the persist attribute, which the swap keeps as they were;
 * `data-eco-rerun` scripts, replayed separately; and non-executable types such as JSON. The
 * browser runs an external module script once per URL in any case.
 */
export function collectBodyScripts(persistAttribute: string): ScriptActivation[] {
	const persistedSelector = `[${persistAttribute}], [${DEFAULT_PERSIST_ATTR}]`;
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
