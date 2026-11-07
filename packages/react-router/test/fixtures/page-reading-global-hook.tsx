import { createElement } from 'react';

type HookProbe = { __globalHook?: boolean; __globalHookAtImport?: boolean };

(globalThis as HookProbe).__globalHookAtImport = (globalThis as HookProbe).__globalHook === true;

export default function PageReadingGlobalHook() {
	return createElement('div', { 'data-testid': 'page-reading-global-hook' }, 'page');
}
