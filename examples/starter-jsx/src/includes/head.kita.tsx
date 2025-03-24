import { Seo } from '@/includes/seo.kita';
import type { PageHeadProps } from '@ecopages/core';

export function Head({ metadata, children }: PageHeadProps) {
  return (
    <head>
      <meta charset="UTF-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1" />
      <Seo {...metadata} />
      <link href="/styles/tailwind.css" rel="stylesheet" />
      {children as 'safe'}
    </head>
  );
}
