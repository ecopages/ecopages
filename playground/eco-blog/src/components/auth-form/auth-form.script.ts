for (const form of document.querySelectorAll<HTMLFormElement>('form[data-auth-form]')) {
	const error = form.querySelector<HTMLElement>('[data-auth-error]');

	form.addEventListener('submit', async (event) => {
		event.preventDefault();
		if (error) error.hidden = true;

		const response = await fetch(form.action, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify(Object.fromEntries(new FormData(form))),
		}).catch(() => null);

		if (response?.ok) {
			window.location.assign(form.dataset.redirect ?? '/');
			return;
		}

		const body = (await response?.json().catch(() => null)) as { message?: string } | null;
		if (error) {
			error.textContent = body?.message ?? 'Something went wrong. Try again.';
			error.hidden = false;
		}
	});
}
