/** @jsxImportSource react */

import { eco } from '@ecopages/core';
import { useState, type ReactNode } from 'react';
import './card.css';

export const DiscoveryCard = eco.component<{}, ReactNode>({
	render: () => {
		const [count, setCount] = useState(0);
		return <button className="discovery-card" onClick={() => setCount(count + 1)}>Count {count}</button>;
	},
});
