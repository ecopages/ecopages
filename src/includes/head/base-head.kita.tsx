import { SeoHead, SeoHeadProps } from "./seo.kita"

export type BaseHeadProps = {
  metadata: SeoHeadProps;
  stylesheets?: string[];
  scripts?: string[];
};

export function BaseHead({ metadata, stylesheets, scripts }: BaseHeadProps) {
  const safeStylesheets = stylesheets?.map((safeStylesheet) => (
    <link rel="stylesheet" href={`/${safeStylesheet}`} />
  ));

  const safeScripts = scripts?.map((script) => <script defer src={`/${script}`} />);

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
  )
}
