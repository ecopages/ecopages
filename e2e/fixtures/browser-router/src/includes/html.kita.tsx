import { eco } from '@ecopages/core';
import type { EcoPagesElement, HtmlTemplateProps } from '@ecopages/core';
import { Head } from '@/includes/head.kita';

export default eco.html<HtmlTemplateProps, EcoPagesElement>({
	dependencies: {
		components: [Head],
	},
	render: ({ children, metadata, headContent, language = 'en' }) => (
		<html lang={language}>
			<Head metadata={metadata}>{headContent}</Head>
			<body>{children as 'safe'}</body>
		</html>
	),
});
