import { Html } from "@elysiajs/html";
import { DsdPolyfillScript } from "../scripts/dsd-polyfill";
import { LitHydrateSupportScript } from "../scripts/lit-hydrate-support";
import { IsLandScript } from "../scripts/is-land";
import { SeoHead, SeoHeadProps } from "../head/seo";


export type BaseHeadProps = {
  metadata: SeoHeadProps;
  headContent?: Html.Children;
  stylesheets?: string[];
};

export function BaseHead({ headContent, metadata, stylesheets }: BaseHeadProps) {
  const safeStylesheets = stylesheets?.map((safeStylesheet) => (
    <style type="text/css">{safeStylesheet}</style>
  ));

  return (
    <head>
      <SeoHead {...metadata} />
      <link rel="icon" type="image/x-icon" href="/public/assets/favicon.ico"></link>
      <LitHydrateSupportScript />
      <DsdPolyfillScript />
      <IsLandScript />
      {safeStylesheets}
      {headContent}
    </head>
  );
}
