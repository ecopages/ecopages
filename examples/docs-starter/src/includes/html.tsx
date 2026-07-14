import { eco } from '@ecopages/core';
import type { HtmlTemplateProps } from '@ecopages/core';
import type { JsxRenderable } from '@ecopages/jsx';
import { Head } from '@/includes/head';

const HtmlTemplate = eco.component<HtmlTemplateProps, JsxRenderable>({
	dependencies: {
		components: [Head],
	},
	render: ({ children, metadata, headContent, language = 'en' }) => {
		return (
			<html lang={language}>
				<Head metadata={metadata}>{headContent}</Head>
				<body>{children as 'safe'}</body>
			</html>
		);
	},
});

export default HtmlTemplate;
