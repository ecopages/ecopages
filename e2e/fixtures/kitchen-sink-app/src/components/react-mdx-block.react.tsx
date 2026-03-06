/** @jsxImportSource react */
import { eco } from '@ecopages/core';
import type { ReactNode } from 'react';
import { LitCounter } from './lit-counter.lit';
import { ReactCounter } from './react-counter.react';
import MdxContent from './react-mdx-content.mdx';

export const ReactMdxBlock = eco.component<{}, ReactNode>({
	integration: 'react',
	dependencies: {
		components: [ReactCounter, LitCounter],
	},
	render: () => (
		<section data-react-mdx>
			<MdxContent />
		</section>
	),
});
