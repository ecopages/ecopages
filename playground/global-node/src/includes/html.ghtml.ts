import { eco, type HtmlTemplateProps } from '@ecopages/core';
import { html } from '@ecopages/core/html';
import { Head } from '@/includes/head.ghtml';

const HtmlTemplate = eco.component<HtmlTemplateProps>({
	dependencies: {
		components: [Head],
	},

	render: ({ children, metadata, headContent, language = 'en' }) => {
		return html`<html lang="${language}">
			!${Head({
				metadata,
				children: headContent,
			})}
			!${children}
		</html>`;
	},
});

export default HtmlTemplate;
