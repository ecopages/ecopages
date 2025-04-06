import { Seo } from '@/includes/seo.ghtml';
import { type PageHeadProps, html } from '@ecopages/core';

export function Head({ metadata, children }: PageHeadProps) {
  return html`<head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    !${Seo(metadata)}
    !${children}
  </head>`;
}
