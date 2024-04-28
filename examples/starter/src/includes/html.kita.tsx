import { Head } from '@/includes/head.kita';
import type { EcoComponent, HtmlTemplateProps } from '@eco-pages/core';

const HtmlTemplate: EcoComponent<HtmlTemplateProps> = ({ children, metadata, headContent, language = 'en' }) => {
  return (
    <html lang={language}>
      <Head metadata={metadata}>{headContent}</Head>
      {children}
    </html>
  );
};

export default HtmlTemplate;
