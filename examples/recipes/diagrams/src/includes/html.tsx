import { eco } from '@ecopages/core';
import type { JsxRenderable } from '@ecopages/jsx';

const HtmlTemplate = eco.html<JsxRenderable>({
	dependencies: {
		stylesheets: ['../styles/diagram.css'],
	},
	render: ({ children, metadata, headContent, language = 'en' }) => (
		<html lang={language}>
			<head>
				<meta charset="UTF-8" />
				<meta name="viewport" content="width=device-width, initial-scale=1" />
				<title>{metadata.title}</title>
				{headContent as 'safe'}
			</head>
			{children as 'safe'}
		</html>
	),
});

export default HtmlTemplate;
