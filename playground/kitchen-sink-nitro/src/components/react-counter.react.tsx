/** @jsxImportSource react */
import { eco } from '@ecopages/core';
import type { ReactNode } from 'react';

export const ReactCounter = eco.component<{}, ReactNode>({
	integration: 'react',
	dependencies: {
		stylesheets: ['./integration-counter.css', './react-counter.css'],
		scripts: [
			{
				src: './react-counter.script.ts',
				attributes: {
					'data-eco-rerun': 'true',
				},
			},
		],
	},
	render: () => (
		<div className="integration-counter" data-react-counter>
			<button className="integration-counter__button" type="button" data-react-inc>
				+
			</button>
			<span className="integration-counter__value" data-react-value>
				0
			</span>
		</div>
	),
});
