import type { EcoComponent, HtmlTemplateProps } from '@ecopages/core';
import type { JSX } from 'react';
import { Head } from '@/includes/head';
import { EcoPropsScript } from '@ecopages/react-router';

const themeScript = `(function(){const t=localStorage.getItem('theme')||(window.matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light');document.documentElement.setAttribute('data-theme',t);if(t==='dark'){document.documentElement.classList.add('dark')}else{document.documentElement.classList.remove('dark')}})();`;

const HtmlTemplate: EcoComponent<HtmlTemplateProps, JSX.Element> = ({
	children,
	metadata,
	headContent,
	language = 'en',
	pageProps,
}) => {
	return (
		<html lang={language}>
			<Head metadata={metadata}>
				<script dangerouslySetInnerHTML={{ __html: themeScript }} />
				{headContent}
			</Head>
			<EcoPropsScript data={pageProps} />
			{children}
		</html>
	);
};

HtmlTemplate.config = {
	dependencies: {
		components: [Head],
	},
};

export default HtmlTemplate;
