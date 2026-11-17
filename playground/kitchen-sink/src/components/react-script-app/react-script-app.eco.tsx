/** @jsxImportSource @ecopages/jsx */
import { eco } from '@ecopages/core';
import type { JsxRenderable } from '@ecopages/jsx';

/**
 * A mount point for a React app that a client script starts, with no React Page or island around it.
 */
export const ReactScriptApp = eco.component<{}, JsxRenderable>({
	dependencies: {
		scripts: ['./react-script-app.script.tsx'],
	},
	render: () => <div data-testid="react-script-app" data-react-script-app />,
});
