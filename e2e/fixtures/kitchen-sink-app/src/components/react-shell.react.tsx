/** @jsxImportSource react */
import { eco } from '@ecopages/core';
import type { ReactNode } from 'react';

type ReactShellProps = {
	id: string;
	children?: ReactNode;
};

export const ReactShell = eco.component<ReactShellProps, ReactNode>({
	integration: 'react',
	render: ({ id, children }) => (
		<section data-react-shell={id}>
			<span data-react-shell-child>{children}</span>
		</section>
	),
});
