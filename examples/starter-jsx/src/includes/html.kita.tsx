import { eco } from '@ecopages/core';
import type { HtmlTemplateProps } from '@ecopages/core';
import { Head } from '@/includes/head.kita';

const themeScript = `(function(){const t=localStorage.getItem('theme')||(window.matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light');document.documentElement.setAttribute('data-theme',t);if(t==='dark'){document.documentElement.classList.add('dark')}else{document.documentElement.classList.remove('dark')}})();`;

const HtmlTemplate = eco.component<HtmlTemplateProps>({
	dependencies: {
		components: [Head],
	},

	render: ({ children, metadata, headContent, language = 'en' }) => {
		return (
			<html lang={language}>
				<Head metadata={metadata}>
					{
						(
							<>
								<script>{themeScript}</script>
								{headContent}
							</>
						) as 'safe'
					}
				</Head>
				<body>{children as 'safe'}</body>
			</html>
		);
	},
});

export default HtmlTemplate;
