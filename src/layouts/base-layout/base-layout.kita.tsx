import { Html } from "root/lib/global/kita";
import { BaseHead, type BaseHeadProps } from "@/includes/head/base-head.kita";
import { getContextDependencies } from "root/lib/component-utils/get-context-dependencies";
import Navigation from "@/components/navigation";

export type BaseLayoutProps = {
  children: JSX.Element;
  language?: string;
} & BaseHeadProps;

const { contextDependencies } = getContextDependencies([Navigation]);

export function BaseLayout({
  children,
  metadata,
  dependencies = [],
  language = "en",
}: BaseLayoutProps) {
  return (
    <html lang={language}>
      <BaseHead metadata={metadata} dependencies={[...contextDependencies, ...dependencies]} />
      <body>
        <Navigation.template />
        <main>{children}</main>
      </body>
    </html>
  );
}
