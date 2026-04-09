const initializedRoots = new WeakSet<HTMLElement>();

function wireReactCounter(root: HTMLElement): void {
	if (initializedRoots.has(root)) {
		return;
	}

	const incrementButton = root.querySelector<HTMLButtonElement>('[data-react-inc]');
	const valueNode = root.querySelector<HTMLElement>('[data-react-value]');

	if (!incrementButton || !valueNode) {
		return;
	}

	incrementButton.addEventListener('click', () => {
		const nextValue = Number(valueNode.textContent ?? '0') + 1;
		valueNode.textContent = String(nextValue);
	});

	initializedRoots.add(root);
}

function initReactCounters(): void {
	for (const root of document.querySelectorAll<HTMLElement>('[data-react-counter]')) {
		wireReactCounter(root);
	}
}

if (document.readyState === 'loading') {
	document.addEventListener('DOMContentLoaded', initReactCounters, { once: true });
} else {
	initReactCounters();
}
