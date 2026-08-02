import type { HtmlTemplateProps } from '@ecopages/core';
import { eco } from '@ecopages/core';
import { html } from '@ecopages/core/html';
import { Head } from './head.ghtml';

export default eco.html({
	dependencies: {
		components: [Head],
	},
	render: ({ children, metadata, headContent, language = 'en' }: HtmlTemplateProps) =>
		html`<html lang="${language}">
			!${Head({
				metadata,
				children: headContent,
			})}
			!${children}
		</html>`,
});
