import type { PageProps } from '@ecopages/core';
import { html } from '@ecopages/core/html';

export default function BlogPost({ params, query }: PageProps) {
	return html`<div>
		<h1>Catch All</h1>
		<p>!${JSON.stringify(params || [])} !${JSON.stringify(query || [])}</p>
	</div>`;
}
