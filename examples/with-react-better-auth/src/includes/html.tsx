import { eco } from '@ecopages/core';
import type { HtmlTemplateProps } from '@ecopages/core';
import type { ReactNode } from 'react';
import { Head } from '@/includes/head';
import { EcoPropsScript } from '@ecopages/react-router';

// Prevents FOUC (Flash of Unstyled Content) for themes
const themeScript = `(function(){const t=localStorage.getItem('theme')||(window.matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light');document.documentElement.setAttribute('data-theme',t);if(t==='dark'){document.documentElement.classList.add('dark')}else{document.documentElement.classList.remove('dark')}})();`;

const HtmlTemplate = eco.component<HtmlTemplateProps, ReactNode>({
	dependencies: {
		components: [Head],
	},

	render: ({ children, metadata, headContent, language = 'en', pageProps }) => {
		return (
			<html lang={language} suppressHydrationWarning>
				<Head metadata={metadata}>
					<script dangerouslySetInnerHTML={{ __html: themeScript }} />
					{headContent}
				</Head>
				<body>
					{children}
					<EcoPropsScript data={pageProps} />
				</body>
			</html>
		);
	},
});

export default HtmlTemplate;
