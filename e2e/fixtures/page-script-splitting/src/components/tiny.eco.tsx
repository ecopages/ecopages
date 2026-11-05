/** @jsxImportSource @ecopages/jsx */
import { eco } from '@ecopages/core';

export const Tiny = eco.component({
	dependencies: { scripts: ['./tiny.script.ts'] },
	render: () => <span>tiny</span>,
});
