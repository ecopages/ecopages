/** @jsxImportSource react */

import { eco } from '@ecopages/core';
import type { ReactNode } from 'react';
import './plain-badge.css';
import { PlainCard } from './plain-card.react';

export const PlainBadge = eco.component<{}, ReactNode>({
	render: () => (
		<div className="discovery-plain-badge">
			<PlainCard label="Badge card" />
		</div>
	),
});
