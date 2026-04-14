import { eco } from '@ecopages/core';
import type { EcoPagesElement } from '@ecopages/core';
import { html, nothing } from 'lit';
import { unsafeHTML } from 'lit/directives/unsafe-html.js';

type LitShellProps = {
	id: string;
	children?: unknown;
};

export const LitShell = eco.component<LitShellProps, EcoPagesElement>({
	integration: 'lit',
	render: ({ id, children }) =>
		html`
			<section class="integration-shell integration-shell--lit" data-lit-shell=${id}>
				<p class="integration-shell__label">Lit shell · ${id}</p>
				<div class="integration-shell__body">
					${typeof children === 'string' ? unsafeHTML(children) : (children ?? nothing)}
				</div>
			</section>
		` as unknown as EcoPagesElement,
});
