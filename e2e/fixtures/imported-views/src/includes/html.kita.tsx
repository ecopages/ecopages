import type { HtmlTemplateProps } from '@ecopages/core';
import { eco } from '@ecopages/core';

export default eco.html({
	render: ({ children, metadata, language = 'en' }: HtmlTemplateProps) => (
		<html lang={language}>
			<head>
				<meta charset="UTF-8" />
				<meta name="viewport" content="width=device-width, initial-scale=1" />
				<title>{metadata.title}</title>
			</head>
			<body>{children as 'safe'}</body>
		</html>
	),
});
