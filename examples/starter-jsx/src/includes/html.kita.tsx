import { eco } from '@ecopages/core';
import type { HtmlTemplateProps } from '@ecopages/core';
import { Seo } from '@/includes/seo.kita';

const themeScript = `(function(){const t=localStorage.getItem('theme')||(window.matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light');document.documentElement.setAttribute('data-theme',t);if(t==='dark'){document.documentElement.classList.add('dark')}else{document.documentElement.classList.remove('dark')}})();`;

const HtmlTemplate = eco.component<HtmlTemplateProps>({
	dependencies: {
		stylesheets: ['../styles/tailwind.css'],
	},

	render: ({ children, metadata, headContent, language = 'en' }) => {
		return (
			<html lang={language}>
				<head>
					<meta charset="UTF-8" />
					<meta name="viewport" content="width=device-width, initial-scale=1" />
					<Seo {...metadata} />
					<script>{themeScript}</script>
					{headContent as 'safe'}
				</head>
				<body>{children as 'safe'}</body>
			</html>
		);
	},
});

export default HtmlTemplate;
