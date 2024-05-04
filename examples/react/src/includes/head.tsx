import { Seo } from '@/includes/seo';
import type { PageHeadProps } from '@eco-pages/core';

/**
 * @todo https://react.dev/blog/2024/04/25/react-19#support-for-preloading-resources
 */
export function Head({ metadata, children }: PageHeadProps) {
  return (
    <head>
      <meta charSet="UTF-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1" />
      <Seo {...metadata} />
      <link href="/styles/tailwind.css" rel="stylesheet" />
      {children}
    </head>
  );
}
