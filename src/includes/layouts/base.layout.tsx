import { Html } from "@elysiajs/html";
import { BaseHead, BaseHeadProps } from "../head/base-head";
import { Navigation } from "@/components/navigation/navigation";

export type BaseLayoutProps = {
  children: Html.Children;
  language?: string;
} & BaseHeadProps;

const contextStylesheet = [
  'base.layout.css',
  Navigation.stylesheet,
];

const contextScripts = [
  "scripts/is-land.script"
]

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
        stylesheets={[...contextStylesheet, ...stylesheets]}
        scripts={[...contextScripts, ...scripts]}
      />
      <body>
        <Navigation />
        <main>
          {children}
        </main>
      </body>
    </html>
  );
}
