const loadedBy: string[] = [];
Object.assign(window, { loadedBy });

/** Records that a script importing this module ran; the e2e spec reads `window.loadedBy`. */
export function markLoaded(name: string): void {
	loadedBy.push(name);
}

class XBtn extends HTMLElement {
	connectedCallback() {
		this.textContent = 'x-btn';
	}
}

customElements.define('x-btn', XBtn);
