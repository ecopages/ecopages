export const systemAppearanceScript = `(() => {
	const preference = matchMedia('(prefers-color-scheme: dark)');
	const apply = () => document.documentElement.classList.toggle('dark', preference.matches);
	apply();
	preference.addEventListener('change', apply);
	window.addEventListener('pageshow', apply);
})();`;
