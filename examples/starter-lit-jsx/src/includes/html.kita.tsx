import { Head } from '@/includes/head.kita';
import type { EcoComponent, HtmlTemplateProps } from '@ecopages/core';

const HtmlTemplate: EcoComponent<HtmlTemplateProps> = ({ children, metadata, headContent, language = 'en' }) => {
  return (
    <html lang={language}>
      <Head metadata={metadata}>{headContent as 'safe'}</Head>
      {children as 'safe'}
    </html>
  );
};

HtmlTemplate.config = {
  importMeta: import.meta,
  dependencies: {
    components: [Head],
  },
};

export default HtmlTemplate;
