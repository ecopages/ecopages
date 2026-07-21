import { DEV_TOOLBAR_PERSIST_KEY } from '../runtime/constants.ts';
import { DEV_TOOLBAR_STYLES } from './styles.ts';

export const DEV_TOOLBAR_STYLES_ELEMENT_ID = 'eco-dev-toolbar-styles';

/**
 * @remarks
 * Radiant JSX does not populate `<style>` text children the way a static tag would.
 * Inject once into `document.head` so toolbar rules apply globally in light DOM.
 */
export function ensureDevToolbarStyles(styles: string = DEV_TOOLBAR_STYLES): void {
	if (document.getElementById(DEV_TOOLBAR_STYLES_ELEMENT_ID)) {
		return;
	}

	const style = document.createElement('style');
	style.id = DEV_TOOLBAR_STYLES_ELEMENT_ID;
	style.setAttribute('data-eco-persist', DEV_TOOLBAR_PERSIST_KEY);
	style.textContent = styles;
	document.head.append(style);
}
