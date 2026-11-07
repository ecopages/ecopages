import { ECO_GLOBAL_SCRIPT_ATTRIBUTE } from '../navigation-attributes.ts';
import { isNonExecutableHeadScript } from './classification.ts';
import { getNavigationScriptIdentity } from './identity.ts';

/**
 * Loads the global scripts of an incoming document that the live document lacks.
 * @module
 */

/** The load of each script this module inserted, so a later navigation waits on one still running. */
const pendingLoads = new WeakMap<HTMLScriptElement, Promise<boolean>>();

function whenSettled(script: HTMLScriptElement): Promise<boolean> {
	const load = new Promise<boolean>((resolve) => {
		script.addEventListener('load', () => resolve(true), { once: true });
		script.addEventListener('error', () => resolve(false), { once: true });
	}).then((loaded) => {
		if (!loaded) script.remove();
		return loaded;
	});
	pendingLoads.set(script, load);
	return load;
}

/**
 * Inserts the incoming document's global scripts into the live head and waits until each has run.
 *
 * @remarks
 * A router calls this before it imports the next Page's modules or swaps its markup. The shared head commit starts
 * the other head scripts after the swap, which is too late for a script that installs a hook a Component module
 * reads while it evaluates, such as Lit's hydration support. A script the live head already holds, by navigation
 * script identity, is not inserted again, but a navigation waits for one this function inserted that is still
 * loading, and a script that failed to load is removed so the next navigation tries it again. Scripts keep document order, and a module script's `load` event fires
 * after the module and its imports have evaluated.
 *
 * @returns `false` when a script failed to load, so the caller can fall back to a document navigation.
 */
export async function loadNavigationGlobalScripts(newDocument: Document): Promise<boolean> {
	const live = new Map(
		Array.from(document.head.querySelectorAll('script'), (script) => [
			getNavigationScriptIdentity(script).key,
			script,
		]),
	);
	const settled: Promise<boolean>[] = [];
	for (const incoming of newDocument.head.querySelectorAll<HTMLScriptElement>(
		`script[${ECO_GLOBAL_SCRIPT_ATTRIBUTE}]`,
	)) {
		const identity = getNavigationScriptIdentity(incoming);
		if (isNonExecutableHeadScript(incoming) || !identity.key) continue;
		const existing = live.get(identity.key);
		if (existing) {
			const loading = pendingLoads.get(existing);
			if (loading) settled.push(loading);
			continue;
		}

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
		live.set(identity.key, script);
		document.head.appendChild(script);
	}
	return (await Promise.all(settled)).every(Boolean);
}
