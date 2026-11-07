import { eco } from '@ecopages/core';
import { ScriptedLayout } from '../layouts/scripted-layout';

export default eco.page({
	layout: ScriptedLayout,
	metadata: () => ({ title: 'Scripted layout', description: 'A layout that declares a browser script.' }),
	render: () => <h1>Scripted</h1>,
});
