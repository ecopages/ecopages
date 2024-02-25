import { Html, type EcoComponent } from "@eco-pages/core";
import { Head, type BaseHeadProps } from "@/includes/head.kita";

export type HtmlTemplateProps = {
  children: Html.Children;
  language?: string;
  headContent?: Html.Children;
} & BaseHeadProps;

export const HtmlTemplate: EcoComponent<HtmlTemplateProps> = ({
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
