import type { HtmlTemplateProps } from '@ecopages/core';
import { eco } from '@ecopages/core';
import { Head } from './head';

export default eco.html({
	dependencies: {
		components: [Head],
	},
	render: ({ children, metadata, headContent, language = 'en' }: HtmlTemplateProps) =>
		`<html lang="${language}">
			${Head({
				metadata,
				children: headContent,
			})}
			${children}
		</html>`,
});
