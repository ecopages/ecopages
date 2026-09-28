import { describe, expect, it } from 'vitest';
import { getHeadScriptKey } from '../src/client/dom/head-updater-script-identity.ts';

function createScript(html: string): HTMLScriptElement {
	const template = document.createElement('template');
	template.innerHTML = html;
	return template.content.firstElementChild as HTMLScriptElement;
}

describe('getHeadScriptKey', () => {
	it('prefers data-eco-script-id, then id, then src, then inline content', () => {
		expect(
			getHeadScriptKey(createScript('<script data-eco-script-id="theme" id="fallback" src="/a.js"></script>')),
		).toBe('id:theme');
		expect(getHeadScriptKey(createScript('<script id="page-data" src="/a.js"></script>'))).toBe('id:page-data');
		expect(getHeadScriptKey(createScript('<script src="/a.js"></script>'))).toBe('src:/a.js');
		expect(getHeadScriptKey(createScript('<script> window.boot() </script>'))).toBe('inline:window.boot()');
		expect(getHeadScriptKey(createScript('<script>   </script>'))).toBeNull();
	});

	it('uses the same key contract for queued script records', () => {
		expect(getHeadScriptKey({ scriptId: 'theme', src: '/a.js', textContent: 'ignored' })).toBe('id:theme');
		expect(getHeadScriptKey({ scriptId: null, src: '/a.js', textContent: 'ignored' })).toBe('src:/a.js');
		expect(getHeadScriptKey({ scriptId: null, src: null, textContent: '  window.boot()  ' })).toBe(
			'inline:window.boot()',
		);
		expect(getHeadScriptKey({ scriptId: null, src: null, textContent: '   ' })).toBeNull();
	});
});
