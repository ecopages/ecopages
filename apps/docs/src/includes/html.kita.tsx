import type { EcoComponent, HtmlTemplateProps } from '@ecopages/core';
import { Head } from '@/includes/head.kita';

const themeScript = `(function(){const t=localStorage.getItem('theme')||(window.matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light');document.documentElement.setAttribute('data-theme',t);if(t==='dark'){document.documentElement.classList.add('dark')}else{document.documentElement.classList.remove('dark')}})();`;

const HtmlTemplate: EcoComponent<HtmlTemplateProps> = ({ children, metadata, headContent, language = 'en' }) => {
	return (
		<html lang={language}>
			<Head metadata={metadata}>{`<script>${themeScript}</script>${headContent ?? ''}` as 'safe'}</Head>
			{children as 'safe'}
		</html>
	);
};

HtmlTemplate.config = {
	dependencies: {
		scripts: ['./html.script.ts'],
		components: [Head],
	},
};

export default HtmlTemplate;
