/** @jsxImportSource react */
import { eco } from '@ecopages/core';
import type { ReactNode } from 'react';
import MdxContent from './react-mdx-content.mdx';

export const ReactMdxBlock = eco.component<{}, ReactNode>({
	integration: 'react',
	render: () => (
		<section data-react-mdx>
			<MdxContent />
		</section>
	),
});
