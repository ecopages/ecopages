import { Seo } from '@/includes/seo';
import { type PageHeadProps, html } from '@ecopages/core';

export function Head({ metadata, children }: PageHeadProps) {
  return html`<head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    !${Seo(metadata)}
    <link href="/styles/tailwind.css" rel="stylesheet" />
    <link href="/styles/alpine.css" rel="stylesheet" />
    !${children}
  </head>`;
}
