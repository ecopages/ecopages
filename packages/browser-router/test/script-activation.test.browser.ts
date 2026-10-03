import { afterEach, describe, expect, it } from 'vitest';
import { activateScriptsInOrder, type ScriptActivation } from '../src/client/dom/script-activation.ts';

const libraryUrl = `data:text/javascript,${encodeURIComponent('window.__activation_library__ = true')}`;

function activation(
	attributes: Record<string, string>,
	inserted: HTMLScriptElement[],
	detached = false,
): ScriptActivation {
	return {
		attributes: Object.entries(attributes),
		textContent: '',
		insert: (script) => {
			inserted.push(script);
			document.body.append(script);
		},
		isDetached: () => detached,
	};
}

afterEach(() => {
	document.body.innerHTML = '';
	Reflect.deleteProperty(window, '__activation_library__');
});

describe('activateScriptsInOrder', () => {
	it('keeps insertion order for external scripts unless the page marked them async', async () => {
		const inserted: HTMLScriptElement[] = [];

		await activateScriptsInOrder([
			activation({ type: 'module', src: '/a.js' }, inserted),
			activation({ src: '/b.js', defer: '' }, inserted),
			activation({ src: '/c.js', async: '' }, inserted),
		]);

		expect(inserted.map((script) => script.async)).toEqual([false, false, true]);
	});

	it('inserts a script only after an earlier parser-blocking script has loaded', async () => {
		const inserted: HTMLScriptElement[] = [];

		const pending = activateScriptsInOrder([activation({ src: libraryUrl }, inserted), activation({}, inserted)]);

		expect(inserted).toHaveLength(1);
		await pending;
		expect(inserted).toHaveLength(2);
		expect((window as typeof window & { __activation_library__?: boolean }).__activation_library__).toBe(true);
	});

	it('skips a script whose target left the document while it waited', async () => {
		const inserted: HTMLScriptElement[] = [];

		await activateScriptsInOrder([activation({ src: libraryUrl }, inserted), activation({}, inserted, true)]);

		expect(inserted).toHaveLength(1);
	});

	it('hands parser-blocking loads that are still pending to the next queue', async () => {
		const inserted: HTMLScriptElement[] = [];

		const pendingLoads = await activateScriptsInOrder([activation({ src: libraryUrl }, inserted)]);

		expect(pendingLoads).toHaveLength(1);
		await Promise.all(pendingLoads);
	});
});
