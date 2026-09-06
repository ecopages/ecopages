import { eco } from '@ecopages/core';
import { Head } from '@/includes/head';
import { EcoPropsScript } from '@ecopages/react-router';
import type { HtmlTemplateProps } from '@ecopages/core';
import type { ReactNode } from 'react';

const themeScript = `(function(){const s=localStorage.getItem('theme');const p=s==='light'||s==='dark'||s==='system'?s:'system';const t=p==='system'?(window.matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light'):p;document.documentElement.setAttribute('data-theme',t);if(t==='dark'){document.documentElement.classList.add('dark')}else{document.documentElement.classList.remove('dark')}})();`;

const announcementScript = `(function(){const d=localStorage.getItem('announcement-bar-dismissed');if(d){document.documentElement.setAttribute('data-announcement-dismissed','true')}})();`;

const HtmlTemplate = eco.component<HtmlTemplateProps, ReactNode>({
	dependencies: {
		scripts: [{ content: themeScript }, { content: announcementScript }],
	},

	render: ({ children, metadata, headContent, language = 'en', pageProps, pageModuleUrl }) => {
		return (
			<html lang={language} suppressHydrationWarning>
				<Head metadata={metadata}>
					{headContent}
					<EcoPropsScript data={pageProps} moduleUrl={pageModuleUrl} />
				</Head>
				<body>{children}</body>
			</html>
		);
	},
});

export default HtmlTemplate;
