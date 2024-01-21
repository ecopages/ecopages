import { Html } from "root/lib/global/kita";
import { BaseHead, type BaseHeadProps } from "@/includes/head/base-head.kita";
import type { EcoComponent } from "@/types";

export type HtmlTemplateProps = {
  children: JSX.Element;
  language?: string;
} & BaseHeadProps;

export const HtmlTemplate: EcoComponent<HtmlTemplateProps> = ({
  children,
  metadata,
  dependencies = [],
  language = "en",
}) => {
  return (
    <html lang={language}>
      <BaseHead metadata={metadata} dependencies={dependencies} />
      {children}
    </html>
  );
};
