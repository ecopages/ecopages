import { type EcoComponent, type HtmlTemplateProps } from "@eco-pages/core";
import { Head } from "@/includes/head.kita";

const HtmlTemplate: EcoComponent<HtmlTemplateProps> = ({
  children,
  metadata,
  dependencies,
  headContent,
  language = "en",
}) => {
  return (
    <html lang={language}>
      <Head metadata={metadata} dependencies={dependencies}>
        {headContent}
      </Head>
      {children}
    </html>
  );
};

export default HtmlTemplate;
