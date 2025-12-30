import { type EcoComponent, type HtmlTemplateProps, html } from '@ecopages/core';
import { Head } from '@/includes/head.ghtml';

const HtmlTemplate: EcoComponent<HtmlTemplateProps> = ({ children, metadata, headContent, language = 'en' }) => {
	return html`<html lang="${language}">
		!${Head({
			metadata,
			children: headContent,
		})}
		!${children}
	</html>`;
};

HtmlTemplate.config = {
	dependencies: {
		components: [Head],
	},
};

export default HtmlTemplate;
