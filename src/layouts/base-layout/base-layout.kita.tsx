import { Html } from "@elysiajs/html";
import { BaseHead, BaseHeadProps } from "@/includes/head/base-head.kita";
import { getContextDependencies } from "root/lib/component-utils/get-context-dependencies";
import Navigation from "@/components/navigation";

export type BaseLayoutProps = {
  children: Html.Children;
  language?: string;
} & BaseHeadProps;

const { contextStylesheets, contextScripts } = getContextDependencies([Navigation]);

export function BaseLayout({
  children,
  metadata,
  stylesheets = [],
  scripts = [],
  language = 'en'
}: BaseLayoutProps) {
  return (
    <html lang={language}>
      <BaseHead
        metadata={metadata}
        stylesheets={[...contextStylesheets, ...stylesheets]}
        scripts={[...contextScripts, ...scripts]}
      />
      <body>
        <Navigation.template />
        <main>
          {children}
        </main>
      </body>
    </html>
  );
}
