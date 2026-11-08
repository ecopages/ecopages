/** @jsxImportSource @ecopages/jsx */
import { eco } from '@ecopages/core';
import type { HtmlTemplateProps } from '@ecopages/core';
import type { JsxRenderable } from '@ecopages/jsx';

const HtmlTemplate = eco.html<JsxRenderable>({
	render: ({ children, metadata, headContent, language = 'en' }: HtmlTemplateProps) => (
		<html lang={language}>
			<head>
				<meta charset="UTF-8" />
				<meta name="viewport" content="width=device-width, initial-scale=1" />
				<title>{metadata.title}</title>
				{headContent as JsxRenderable}
			</head>
			<body>{children as JsxRenderable}</body>
		</html>
	),
});

export default HtmlTemplate;
