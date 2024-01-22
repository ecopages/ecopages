import { Html } from "root/lib/global/kita";
import { Head, type BaseHeadProps } from "@/includes/head.kita";
import type { EcoComponent } from "root/lib/eco-pages.types";

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
