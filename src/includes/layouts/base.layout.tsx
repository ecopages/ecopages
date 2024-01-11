import { Html } from "@elysiajs/html";
import { BaseHead, BaseHeadProps } from "../head/base-head";
import { Navigation } from "@/components/navigation/navigation";
import { createStylesheets } from "macros/stylesheets.macro"  with { type: 'macro' };

export type BaseLayoutProps = {
  children: Html.Children;
  metadata: BaseHeadProps["metadata"];
  headContent?: BaseHeadProps["headContent"];
  language?: string;
  stylesheets?: string[];
};

const normalizeCss = await createStylesheets({ paths: ['@/src/includes/layouts/normalize.styles.css'] });
const baseLayoutCss = await createStylesheets({ paths: ['@/src/includes/layouts/base.layout.styles.css'] });

export function BaseLayout({
  children,
  headContent,
  metadata,
  stylesheets = [],
  language = 'en'
}: BaseLayoutProps) {
  return (
    <html lang={language}>
      <BaseHead metadata={metadata} headContent={headContent} stylesheets={[...normalizeCss, ...baseLayoutCss, ...stylesheets, ...Navigation.stylesheets]} />
      <body dsd-pending>
        <Navigation />
        <main>
          {children}
        </main>
      </body>
    </html>
  );
}
