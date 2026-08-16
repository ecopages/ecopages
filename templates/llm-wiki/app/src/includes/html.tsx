import { eco } from '@ecopages/core';
import type { HtmlTemplateProps } from '@ecopages/core';
import type { JsxRenderable } from '@ecopages/jsx';
import { Head } from '@/includes/head';

const themeScript = `(function(){const s=localStorage.getItem('theme');const p=s==='light'||s==='dark'||s==='system'?s:'system';const t=p==='system'?(window.matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light'):p;document.documentElement.setAttribute('data-theme',t);if(t==='dark'){document.documentElement.classList.add('dark')}else{document.documentElement.classList.remove('dark')}})();`;

const HtmlTemplate = eco.component<HtmlTemplateProps, JsxRenderable>({
	dependencies: {
		components: [Head],
		scripts: [
			{
				content: themeScript,
				attributes: {
					defer: '',
				},
			},
		],
	},
	render: ({ children, metadata, headContent, language = 'en' }) => {
		return (
			<html lang={language}>
				<Head metadata={metadata}>{headContent}</Head>
				{children as 'safe'}
			</html>
		);
	},
});

export default HtmlTemplate;
