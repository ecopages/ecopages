(() => {
	const form = document.querySelector<HTMLFormElement>('#post-form');
	if (!form) return;

	const titleInput = form.querySelector<HTMLInputElement>('input[name="title"]');
	const slugInput = form.querySelector<HTMLInputElement>('input[name="slug"]');
	if (!titleInput || !slugInput) return;

	let slugWasManuallyAltered = slugInput.value.trim().length > 0;

	const slugify = (value: string) => {
		return value
			.normalize('NFKD')
			.replace(/[\u0300-\u036f]/g, '')
			.toLowerCase()
			.trim()
			.replace(/[^a-z0-9]+/g, '-')
			.replace(/^-+|-+$/g, '');
	};

	const syncSlugFromTitle = () => {
		if (slugWasManuallyAltered) return;
		slugInput.value = slugify(titleInput.value);
	};

	titleInput.addEventListener('input', syncSlugFromTitle);

	slugInput.addEventListener('input', () => {
		slugWasManuallyAltered = true;
	});

	syncSlugFromTitle();
})();
