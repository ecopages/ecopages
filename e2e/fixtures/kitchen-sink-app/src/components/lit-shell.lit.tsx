import { eco } from '@ecopages/core';
import type { EcoPagesElement } from '@ecopages/core';

type LitShellProps = {
	id: string;
	children?: string;
};

export const LitShell = eco.component<LitShellProps, EcoPagesElement>({
	integration: 'lit',
	render: ({ id, children }) => <section data-lit-shell={id}>{children as 'safe'}</section>,
});
