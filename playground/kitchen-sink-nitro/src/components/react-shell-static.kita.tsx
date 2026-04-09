import { eco } from '@ecopages/core';
import type { EcoPagesElement } from '@ecopages/core';

type ReactShellStaticProps = {
	id: string;
	children?: EcoPagesElement;
};

export const ReactShellStatic = eco.component<ReactShellStaticProps, EcoPagesElement>({
	integration: 'kitajs',
	render: ({ id, children }) => (
		<section class="integration-shell integration-shell--react" data-react-shell={id}>
			<p class="integration-shell__label">React shell · {id}</p>
			<div class="integration-shell__body">
				<div data-react-shell-child>{children}</div>
			</div>
		</section>
	),
});
