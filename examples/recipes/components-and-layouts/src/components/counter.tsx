import { eco } from '@ecopages/core';

/** Browser behavior needs `scripts`, which only a declared component carries. */
export const Counter = eco.component({
	dependencies: { scripts: ['./counter.script.ts'] },
	render: () => <button data-counter>0</button>,
});
