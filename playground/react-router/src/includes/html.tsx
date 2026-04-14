import { eco } from '@ecopages/core';
import type { ReactNode } from 'react';
import { Head } from '@/includes/head';
import { EcoPropsScript } from '@ecopages/react-router';

const themeScript = `(function(){const t=localStorage.getItem('theme')||(window.matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light');document.documentElement.setAttribute('data-theme',t);if(t==='dark'){document.documentElement.classList.add('dark')}else{document.documentElement.classList.remove('dark')}})();`;

const HtmlTemplate = eco.html<ReactNode>({
	dependencies: {
		components: [Head],
		scripts: [{ content: themeScript }],
	},

	render: ({ children, metadata, headContent, language = 'en', pageProps }) => {
		return (
			<html lang={language}>
				<Head metadata={metadata}>
					{headContent}
					<EcoPropsScript data={pageProps} />
				</Head>
				<body>{children}</body>
			</html>
		);
	},
});

export default HtmlTemplate;
