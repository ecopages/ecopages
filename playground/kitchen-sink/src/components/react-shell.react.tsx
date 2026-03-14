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
		<section className="integration-shell integration-shell--react" data-react-shell={id}>
			<p className="integration-shell__label">React shell · {id}</p>
			<div className="integration-shell__body">
				<span data-react-shell-child>{children}</span>
			</div>
		</section>
	),
});
