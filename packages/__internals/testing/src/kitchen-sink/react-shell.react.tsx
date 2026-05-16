/** @jsxImportSource react */
import { eco } from '@ecopages/core';
import type { EcoChildren } from '@ecopages/core';
import type { ReactNode } from 'react';

type ReactShellProps = {
	id: string;
	children?: ReactNode | EcoChildren;
};

export const ReactShell = eco.component<ReactShellProps, ReactNode>({
	integration: 'react',
	render: ({ id, children }) => {
		const body =
			typeof children === 'string' ? (
				<div className="integration-shell__body" dangerouslySetInnerHTML={{ __html: children }} />
			) : (
				<div className="integration-shell__body">{children as ReactNode}</div>
			);

		return (
			<section className="integration-shell integration-shell--react" data-react-shell={id}>
				<p className="integration-shell__label">React shell · {id}</p>
				{body}
			</section>
		);
	},
});
