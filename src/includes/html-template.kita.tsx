import { Html, type EcoComponent } from "@eco-pages/core";
import { Head, type BaseHeadProps } from "@/includes/head.kita";

export type HtmlTemplateProps = {
  children: Html.Children;
  language?: string;
} & BaseHeadProps;

export const HtmlTemplate: EcoComponent<HtmlTemplateProps> = ({
  children,
  metadata,
  dependencies,
  language = "en",
}) => {
  return (
    <html lang={language}>
      <Head metadata={metadata} dependencies={dependencies} />
      {children}
    </html>
  );
};
