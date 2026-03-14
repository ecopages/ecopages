function bindKitaCounters() {
	const roots = document.querySelectorAll<HTMLElement>('[data-kita-counter]');

	for (const root of roots) {
		if (root.dataset.bound === 'true') {
			continue;
		}

		root.dataset.bound = 'true';
		const value = root.querySelector<HTMLElement>('[data-kita-value]');
		const inc = root.querySelector<HTMLButtonElement>('[data-kita-inc]');
		if (!value || !inc) {
			continue;
		}

		inc.addEventListener('click', () => {
			const next = Number(value.textContent ?? '0') + 1;
			value.textContent = String(next);
		});
	}
}

queueMicrotask(bindKitaCounters);