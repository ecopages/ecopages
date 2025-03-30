import { Head } from '@/includes/head.ghtml';
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

export default HtmlTemplate;
