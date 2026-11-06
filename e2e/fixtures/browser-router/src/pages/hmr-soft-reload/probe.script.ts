import { PROBE_LABEL } from './probe-lib.ts';

type ProbeWindow = Window & {
	__probe?: { connect: Record<string, number>; disconnect: Record<string, number>; lib: string };
};

const w = window as ProbeWindow;
w.__probe ??= { connect: {}, disconnect: {}, lib: PROBE_LABEL };
w.__probe.lib = PROBE_LABEL;
const probe = w.__probe;

function bump(map: Record<string, number>, id: string) {
	map[id] = (map[id] ?? 0) + 1;
}

class XCounter extends HTMLElement {
	count = 0;
	connectedCallback() {
		bump(probe.connect, this.id);
		const root = this.shadowRoot ?? this;
		const button = root.querySelector('button');
		button?.addEventListener('click', () => {
			this.count += 1;
			button.textContent = `Count: ${this.count}`;
		});
	}
	disconnectedCallback() {
		bump(probe.disconnect, this.id);
	}
}

if (!customElements.get('x-counter')) customElements.define('x-counter', XCounter);
if (!customElements.get('x-shadow-counter')) customElements.define('x-shadow-counter', class extends XCounter {});

document.getElementById('plain')?.classList.add('is-active');
