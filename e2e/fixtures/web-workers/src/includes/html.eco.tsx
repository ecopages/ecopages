/** @jsxImportSource @ecopages/jsx */
import { eco } from '@ecopages/core';
import type { HtmlTemplateProps } from '@ecopages/core';

export default eco.html({
	render: ({ children, metadata, headContent, language = 'en' }: HtmlTemplateProps) => (
		<html lang={language}>
			<head>
				<meta charset="UTF-8" />
				<title>{metadata.title}</title>
				{headContent}
			</head>
			<body>{children as 'safe'}</body>
		</html>
	),
});
