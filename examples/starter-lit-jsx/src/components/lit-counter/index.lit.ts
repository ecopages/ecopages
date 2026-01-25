import type { EcoComponent } from '@ecopages/core';
import './lit-counter.script';

export const LitCounter: EcoComponent = {
	config: {
		dependencies: {
			scripts: ['lit-counter.script.ts'],
		},
	},
};
