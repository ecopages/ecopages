const counter = document.querySelector<HTMLButtonElement>('[data-counter]');

counter?.addEventListener('click', () => {
	counter.textContent = String(Number(counter.textContent) + 1);
});
