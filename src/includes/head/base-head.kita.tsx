import { SeoHead, type MetadataProps } from "./seo.kita";

export type BaseHeadProps = {
  metadata: MetadataProps;
  dependencies?: string[];
};

export function BaseHead({ metadata, dependencies }: BaseHeadProps) {
  const safeStylesheets = dependencies
    ?.filter((dependency) => dependency.endsWith(".css"))
    .map((safeStylesheet) => <link rel="stylesheet" href={`/${safeStylesheet}`} />);

  const safeScripts = dependencies
    ?.filter((dependency) => dependency.endsWith(".js"))
    .map((script) => <script defer src={`/${script}`} />);

  return (
    <head>
      <meta charset="UTF-8"></meta>
      <meta name="viewport" content="width=device-width, initial-scale=1"></meta>
      <SeoHead {...metadata} />
      <link rel="robots" href="/robots.txt"></link>
      {safeScripts}
      <script defer src="https://cdn.jsdelivr.net/npm/alpinejs@3.x.x/dist/cdn.min.js"></script>
      <link rel="icon" type="image/x-icon" href="/public/assets/favicon.ico"></link>
      <link href="/global/css/tailwind.css" rel="stylesheet"></link>
      <link href="/global/css/alpine.css" rel="stylesheet"></link>
      {safeStylesheets}
    </head>
  );
}
