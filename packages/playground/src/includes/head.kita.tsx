import { type EcoComponentDependencies } from "@eco-pages/core";
import { type MetadataProps, Seo } from "@/includes/seo.kita";

export type BaseHeadProps = {
  metadata: MetadataProps;
  dependencies?: EcoComponentDependencies;
  children?: Html.Children;
};

export function Head({ metadata, children }: BaseHeadProps) {
  return (
    <head>
      <meta charset="UTF-8"></meta>
      <meta name="viewport" content="width=device-width, initial-scale=1"></meta>
      <Seo {...metadata} />
      <link href="/global/css/tailwind.css" rel="stylesheet"></link>
      <link href="/global/css/alpine.css" rel="stylesheet"></link>
      <script defer src="/components/script-injector/script-injector.script.js" />
      {children}
    </head>
  );
}
