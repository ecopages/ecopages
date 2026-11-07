import { ECO_GLOBAL_SCRIPT_ATTRIBUTE } from '../navigation-attributes.ts';
import { isNonExecutableHeadScript } from './classification.ts';
import { getNavigationScriptIdentity } from './identity.ts';

/**
 * Loads the global scripts of an incoming document that the live document lacks.
 * @module
 */

function whenSettled(script: HTMLScriptElement): Promise<boolean> {
	return new Promise((resolve) => {
		script.addEventListener('load', () => resolve(true), { once: true });
		script.addEventListener('error', () => resolve(false), { once: true });
	});
}

/**
 * Inserts the incoming document's global scripts into the live head and waits until each has run.
 *
 * @remarks
 * A router calls this before it imports the next Page's modules or swaps its markup. The shared head commit starts
 * the other head scripts after the swap, which is too late for a script that installs a hook a Component module
 * reads while it evaluates, such as Lit's hydration support. A script the live head already holds, by navigation
 * script identity, is not inserted again. Scripts keep document order, and a module script's `load` event fires
 * after the module and its imports have evaluated.
 *
 * @returns `false` when a script failed to load, so the caller can fall back to a document navigation.
 */
export async function loadNavigationGlobalScripts(newDocument: Document): Promise<boolean> {
	const known = new Set(
		Array.from(document.head.querySelectorAll('script'), (script) => getNavigationScriptIdentity(script).key),
	);
	const settled: Promise<boolean>[] = [];
	for (const incoming of newDocument.head.querySelectorAll<HTMLScriptElement>(
		`script[${ECO_GLOBAL_SCRIPT_ATTRIBUTE}]`,
	)) {
		const identity = getNavigationScriptIdentity(incoming);
		if (isNonExecutableHeadScript(incoming) || !identity.key || known.has(identity.key)) continue;
		known.add(identity.key);

		const script = document.createElement('script');
		for (const attribute of incoming.attributes) {
			script.setAttribute(
				attribute.name,
				attribute.name === 'src' && identity.src ? identity.src : attribute.value,
			);
		}
		script.textContent = incoming.textContent;
		if (script.hasAttribute('src')) {
			script.async = false;
			settled.push(whenSettled(script));
		}
		document.head.appendChild(script);
	}
	return (await Promise.all(settled)).every(Boolean);
}
