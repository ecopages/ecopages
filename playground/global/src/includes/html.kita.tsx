import { eco } from '@ecopages/core';
import type { HtmlTemplateProps } from '@ecopages/core';
import { Head } from '@/includes/head.kita';

export default eco.html({
	dependencies: {
		stylesheets: ['../styles/tailwind.css', '../styles/alpine.css'],
	},
	render: ({ children, metadata, headContent, language = 'en' }: HtmlTemplateProps) => (
		<html lang={language}>
			<Head metadata={metadata}>{headContent as 'safe'}</Head>
			{children as 'safe'}
		</html>
	),
});
