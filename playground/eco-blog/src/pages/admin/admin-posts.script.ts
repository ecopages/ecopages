document.addEventListener('submit', (event) => {
	const form = event.target;
	if (form instanceof HTMLFormElement && form.dataset.confirm && !window.confirm(form.dataset.confirm)) {
		event.preventDefault();
	}
});
