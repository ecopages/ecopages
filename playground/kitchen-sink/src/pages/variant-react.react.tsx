/** @jsxImportSource react */
import { eco } from '@ecopages/core';
import { SharedCounter } from '@/components/variant-shared/shared-counter';
import type { ReactNode } from 'react';

export default eco.page<{}, ReactNode>({
	dependencies: {
		components: [SharedCounter],
	},
	render: () => (
		<main data-testid="page-variant-react">
			<SharedCounter count={5} />
		</main>
	),
});
