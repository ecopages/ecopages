import { Head } from '@/includes/head.kita';
import type { EcoComponent, HtmlTemplateProps } from '@ecopages/core';

const HtmlTemplate: EcoComponent<HtmlTemplateProps> = ({ children, metadata, headContent, language = 'en' }) => {
  return (
    <html lang={language} class="dark">
      <Head metadata={metadata}>{headContent as 'safe'}</Head>
      {children as 'safe'}
    </html>
  );
};

export default HtmlTemplate;
