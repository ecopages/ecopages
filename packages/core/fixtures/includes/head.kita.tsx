import type { PageHeadProps } from "@eco-pages/core";
import { Seo } from "./seo.kita";

export function Head({ metadata, children }: PageHeadProps) {
  return (
    <head>
      <meta charset="UTF-8"></meta>
      <meta name="viewport" content="width=device-width, initial-scale=1"></meta>
      <Seo {...metadata} />
      {children}
    </head>
  );
}
