import { eco } from '@ecopages/core';
import type { EcoPagesElement } from '@ecopages/core';

type LitShellProps = {
	id: string;
	children?: unknown;
};

export const LitShell = eco.component<LitShellProps, EcoPagesElement>({
	integration: 'lit',
	render: ({ id, children }) => (
		<section class="integration-shell integration-shell--lit" data-lit-shell={id}>
			<p class="integration-shell__label">Lit shell · {id}</p>
			<div class="integration-shell__body">{children as 'safe'}</div>
		</section>
	),
});
