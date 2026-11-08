import { eco } from '@ecopages/core';
import type { ReactNode } from 'react';
import { PlainBadge } from '@/components/dependency-discovery/plain-badge.react';
import { PlainCard } from '@/components/dependency-discovery/plain-card.react';

export default eco.page<{}, ReactNode>({
	render: () => (
		<main>
			<PlainBadge />
			<PlainCard label="Page card" />
		</main>
	),
});
