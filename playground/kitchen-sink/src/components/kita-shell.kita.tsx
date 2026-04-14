import { eco } from '@ecopages/core';
import type { EcoChildren, EcoPagesElement } from '@ecopages/core';

type KitaShellProps = {
	id: string;
	children?: EcoChildren;
};

export const KitaShell = eco.component<KitaShellProps, EcoPagesElement>({
	integration: 'kitajs',
	render: ({ id, children }) => {
		return (
			<section class="integration-shell integration-shell--kita" data-kita-shell={id}>
				<p class="integration-shell__label">Kita shell · {id}</p>
				<div class="integration-shell__body">{children as 'safe'}</div>
			</section>
		);
	},
});
