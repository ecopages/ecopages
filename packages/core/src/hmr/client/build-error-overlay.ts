/**
 * Minimal in-page element that lists the messages of HMR `error` events. The HMR runtime removes it on
 * any other HMR event.
 *
 * @remarks
 * The element is appended to `document.documentElement` rather than `body`, because the browser router
 * replaces or morphs `body` on navigation.
 *
 * @module
 */

export const BUILD_ERROR_OVERLAY_ID = '__ecopages_build_error__';

const OVERLAY_STYLE = [
	'position:fixed',
	'left:0',
	'right:0',
	'bottom:0',
	'z-index:2147483647',
	'max-height:50vh',
	'overflow:auto',
	'padding:12px 16px',
	'background:#1b0b0b',
	'color:#ffd7d7',
	'border-top:3px solid #e5484d',
	'font:12px/1.5 ui-monospace,SFMono-Regular,Menlo,monospace',
].join(';');

const HEADER_STYLE = 'display:flex;justify-content:space-between;align-items:center;gap:16px';

const ENTRY_STYLE = 'margin:8px 0 0;white-space:pre-wrap;font:inherit';

const BUTTON_STYLE = 'font:inherit;color:inherit;background:none;border:1px solid currentColor;padding:2px 8px';

function onKeydown(event: KeyboardEvent): void {
	if (event.key === 'Escape') {
		clearBuildError();
	}
}

function createOverlay(): HTMLElement {
	const overlay = document.createElement('div');
	overlay.id = BUILD_ERROR_OVERLAY_ID;
	overlay.setAttribute('role', 'alert');
	overlay.style.cssText = OVERLAY_STYLE;

	const header = document.createElement('div');
	header.style.cssText = HEADER_STYLE;
	const title = document.createElement('strong');
	title.textContent = '[ecopages] Error';
	const dismiss = document.createElement('button');
	dismiss.type = 'button';
	dismiss.textContent = 'Dismiss';
	dismiss.style.cssText = BUTTON_STYLE;
	header.append(title, dismiss);
	overlay.append(header);

	overlay.addEventListener('click', (event) => {
		const selectingText = document.getSelection()?.isCollapsed === false;
		if (event.target === dismiss || !selectingText) {
			clearBuildError();
		}
	});
	return overlay;
}

/**
 * Adds `message` to the overlay, creating it when needed. A message already shown is not repeated.
 * A click outside a text selection, the Dismiss button or Escape removes the overlay.
 */
export function showBuildError(message: string): void {
	let overlay = document.getElementById(BUILD_ERROR_OVERLAY_ID);
	if (!overlay) {
		overlay = createOverlay();
		document.documentElement.append(overlay);
		document.addEventListener('keydown', onKeydown);
	}
	if (Array.from(overlay.querySelectorAll('pre')).some((entry) => entry.textContent === message)) {
		return;
	}
	const entry = document.createElement('pre');
	entry.style.cssText = ENTRY_STYLE;
	entry.textContent = message;
	overlay.append(entry);
}

export function clearBuildError(): void {
	document.getElementById(BUILD_ERROR_OVERLAY_ID)?.remove();
	document.removeEventListener('keydown', onKeydown);
}
