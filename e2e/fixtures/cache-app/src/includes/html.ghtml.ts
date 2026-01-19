import type { EcoComponent, HtmlTemplateProps } from '@ecopages/core';
import { html } from '@ecopages/core/html';
import { Head } from './head.ghtml';

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
