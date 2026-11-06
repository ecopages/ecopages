/** @jsxImportSource @ecopages/jsx */
import { eco } from '@ecopages/core';

export const Widget = eco.component({
	dependencies: { scripts: ['./widget.script.ts'] },
	render: () => <button type="button">widget</button>,
});
