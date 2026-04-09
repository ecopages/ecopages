import { eco } from '@ecopages/core';
import type { HtmlTemplateProps } from '@ecopages/core';
import { Seo } from '@/includes/seo.kita';

const HtmlTemplate = eco.html({
	dependencies: {
		stylesheets: ['../styles/fonts.css', '../styles/tailwind.css'],
	},
	render: ({ children, metadata, headContent, language = 'en' }: HtmlTemplateProps) => {
		return (
			<html lang={language}>
				<head>
					<meta charset="UTF-8" />
					<meta name="viewport" content="width=device-width, initial-scale=1" />
					<meta name="theme-color" content="#0f172a" />
					<Seo {...metadata} />
					{headContent as 'safe'}
					<script data-eco-rerun="true" data-eco-script-id="theme-bootstrap">
						{`
							(() => {
								const runtime = globalThis;
								const applyTheme = (theme) => {
									if (theme === 'dark') {
										document.documentElement.setAttribute('data-theme', 'dark');
										return;
									}

									document.documentElement.removeAttribute('data-theme');
								};
								const resolveTheme = () =>
									localStorage.getItem('theme') ||
									(window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
								const toggleTheme = () => {
									const nextTheme = document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
									localStorage.setItem('theme', nextTheme);
									applyTheme(nextTheme);
								};

								runtime.__ecopagesThemeToggleCleanup__?.();
								const abortController = new AbortController();
								runtime.__ecopagesThemeToggleCleanup__ = () => {
									abortController.abort();
								};

								applyTheme(resolveTheme());

								document.addEventListener(
									'click',
									(event) => {
										const target = event.target;
										if (!(target instanceof Element)) {
											return;
										}

										const toggle = target.closest('[data-theme-toggle-runtime="dom"]#theme-toggle');
										if (!toggle) {
											return;
										}

										event.preventDefault();
										toggleTheme();
									},
									{ signal: abortController.signal },
								);
							})();
						`}
					</script>
				</head>
				<body class="bg-background text-on-background">{children as 'safe'}</body>
			</html>
		);
	},
});

export default HtmlTemplate;
