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
								const theme =
									localStorage.getItem('theme') ||
									(window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');

								if (theme === 'dark') {
									document.documentElement.setAttribute('data-theme', 'dark');
									return;
								}

								document.documentElement.removeAttribute('data-theme');
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
