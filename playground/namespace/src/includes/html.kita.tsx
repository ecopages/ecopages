import { eco } from '@ecopages/core';
import type { HtmlTemplateProps } from '@ecopages/core';
import { Head } from '@/includes/head.kita';

export default eco.component<HtmlTemplateProps>({
	dependencies: {
		components: [Head],
	},
	render: ({ children, metadata, headContent, language = 'en' }) => (
		<html lang={language}>
			<Head metadata={metadata}>{headContent as 'safe'}</Head>
			<body>{children as 'safe'}</body>
		</html>
	),
});
