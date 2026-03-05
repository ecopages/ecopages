import { RadiantElement } from '@ecopages/radiant/core/radiant-element';
import { customElement } from '@ecopages/radiant/decorators/custom-element';

const STORAGE_KEY = 'code-tabs-selected';

@customElement('radiant-code-tabs')
export class RadiantCodeTabs extends RadiantElement {
	header!: HTMLElement;
	content!: HTMLElement;

	override connectedCallback() {
		super.connectedCallback();
		this.header = this.querySelector('.code-tabs-header') as HTMLElement;
		this.content = this.querySelector('.code-tabs-content') as HTMLElement;
		this.initTabs();
	}

	initTabs() {
		if (!this.header || !this.content) return;

		const panels = Array.from(this.querySelectorAll('.code-tab-panel')) as HTMLElement[];
		if (!panels.length) return;

		const storedName = localStorage.getItem(STORAGE_KEY);
		const defaultIndex = Math.max(
			0,
			panels.findIndex((p) => p.getAttribute('data-name') === storedName),
		);

		panels.forEach((panel, index) => {
			const name = panel.getAttribute('data-name') || `Tab ${index + 1}`;
			const button = document.createElement('button');
			button.className = 'code-tab-button';
			button.textContent = name;
			button.setAttribute('role', 'tab');
			button.setAttribute('aria-selected', (index === defaultIndex).toString());
			if (index === defaultIndex) button.classList.add('active');
			button.addEventListener('click', () => this.selectTab(index));
			this.header.appendChild(button);

			panel.style.display = index === defaultIndex ? 'block' : 'none';
		});
	}

	selectTab(index: number) {
		const buttons = Array.from(this.header.querySelectorAll('button'));
		const panels = Array.from(this.querySelectorAll('.code-tab-panel')) as HTMLElement[];

		buttons.forEach((btn, i) => {
			const isSelected = i === index;
			btn.setAttribute('aria-selected', isSelected.toString());
			btn.classList.toggle('active', isSelected);
		});

		panels.forEach((panel, i) => {
			panel.style.display = i === index ? 'block' : 'none';
		});

		const selectedPanel = panels[index];
		const name = selectedPanel?.getAttribute('data-name');
		if (name) localStorage.setItem(STORAGE_KEY, name);
	}
}

declare global {
	namespace JSX {
		interface IntrinsicElements {
			'radiant-code-tabs': HtmlTag;
		}
	}
}
