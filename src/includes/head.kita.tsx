import { type EcoComponentDependencies } from "@eco-pages/core";
import { type MetadataProps, Seo } from "./seo.kita";

export type BaseHeadProps = {
  metadata: MetadataProps;
  dependencies?: EcoComponentDependencies;
};

export function Head({ metadata, dependencies }: BaseHeadProps) {
  const safeDependenciesStylesheets = dependencies?.stylesheets?.map((stylesheet) => (
    <link rel="stylesheet" href={stylesheet} />
  ));
  const safeDependenciesScripts = dependencies?.scripts?.map((script) => (
    <script defer src={script} />
  ));

  return (
    <head>
      <meta charset="UTF-8"></meta>
      <meta name="viewport" content="width=device-width, initial-scale=1"></meta>
      <Seo {...metadata} />
      {safeDependenciesScripts}
      <script defer src="https://cdn.jsdelivr.net/npm/alpinejs@3.x.x/dist/cdn.min.js"></script>
      <link href="/global/css/tailwind.css" rel="stylesheet"></link>
      <link href="/global/css/alpine.css" rel="stylesheet"></link>
      {safeDependenciesStylesheets}
    </head>
  );
}
