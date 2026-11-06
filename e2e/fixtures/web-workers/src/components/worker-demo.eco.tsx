/** @jsxImportSource @ecopages/jsx */
import { eco } from '@ecopages/core';

export const WorkerDemo = eco.component({
	dependencies: { scripts: ['./worker-demo.script.ts'] },
	render: () => <output data-worker-reply>waiting</output>,
});
