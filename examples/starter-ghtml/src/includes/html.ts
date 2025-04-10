import { Head } from '@/includes/head';
import { type EcoComponent, type HtmlTemplateProps, html } from '@ecopages/core';

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
  importMeta: import.meta,
  dependencies: {
    components: [Head],
  },
};

export default HtmlTemplate;
