document.addEventListener('click', async () => {
	const { bigEntries } = await import('./big.ts');
	document.body.dataset.big = String(bigEntries.length);
});
