export function ThemeToggle() {
	return (
		<button id="theme-toggle" class="button" title="Toggle theme" aria-label="Toggle theme">
			<span class="dark-hidden">Dark Mode</span>
			<span class="light-hidden hidden">Light Mode</span>
			<script>
				{`
					const btn = document.getElementById('theme-toggle');
					const updateBtn = () => {
						const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
						btn.querySelector('.dark-hidden').classList.toggle('hidden', isDark);
						btn.querySelector('.light-hidden').classList.toggle('hidden', !isDark);
					};
					updateBtn();
					btn.addEventListener('click', () => {
						const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
						if (isDark) {
							document.documentElement.removeAttribute('data-theme');
							localStorage.setItem('theme', 'light');
						} else {
							document.documentElement.setAttribute('data-theme', 'dark');
							localStorage.setItem('theme', 'dark');
						}
						updateBtn();
					});
				`}
			</script>
		</button>
	);
}
