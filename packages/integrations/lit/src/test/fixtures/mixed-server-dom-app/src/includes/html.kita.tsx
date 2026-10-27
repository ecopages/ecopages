import { eco } from '@ecopages/core';
import type { HtmlTemplateProps } from '@ecopages/core';

export default eco.html({
	render: ({ children, metadata, headContent, language = 'en' }: HtmlTemplateProps) => (
		<html lang={language}>
			<head>
				<title>{metadata.title}</title>
				<meta name="description" content={metadata.description} />
				{headContent as 'safe'}
			</head>
			<body>{children as 'safe'}</body>
		</html>
	),
});
