import type { EcoComponent, HtmlTemplateProps } from '@ecopages/core';
import type { JSX } from 'react';
import { Head } from '@/includes/head';

const HtmlTemplate: EcoComponent<HtmlTemplateProps, JSX.Element> = ({
  children,
  metadata,
  headContent,
  language = 'en',
}) => {
  return (
    <html lang={language}>
      <Head metadata={metadata}>{headContent}</Head>
      {children}
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
