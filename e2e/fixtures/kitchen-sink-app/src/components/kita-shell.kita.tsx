/** @jsxImportSource @kitajs/html */
import { eco } from '@ecopages/core';
import type { EcoPagesElement } from '@ecopages/core';

type KitaShellProps = {
	id: string;
	children?: string;
};

export const KitaShell = eco.component<KitaShellProps, EcoPagesElement>({
	integration: 'kitajs',
	render: ({ id, children }) => <section data-kita-shell={id}>{children as 'safe'}</section>,
});
