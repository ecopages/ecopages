import { eco } from '@ecopages/core';
import type { JsxRenderable } from '@ecopages/jsx';

/** A layout that ships a browser script uses `eco.layout()`. */
export const ScriptedLayout = eco.layout<JsxRenderable>({
	dependencies: { scripts: ['./scripted-layout.script.ts'] },
	render: ({ children }) => (
		<div data-layout="scripted">
			<header>Scripted layout</header>
			{children}
		</div>
	),
});
