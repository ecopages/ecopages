function bindLitCounter() {
	const root = document.querySelector('[data-lit-counter]');
	if (!root || root.getAttribute('data-bound') === 'true') {
		return;
	}

	root.setAttribute('data-bound', 'true');
	const value = root.querySelector('[data-lit-value]');
	const inc = root.querySelector('[data-lit-inc]');
	if (!value || !inc) {
		return;
	}

	inc.addEventListener('click', () => {
		const next = Number(value.textContent ?? '0') + 1;
		value.textContent = String(next);
	});
}

queueMicrotask(bindLitCounter);
