import { eco } from '@ecopages/core';
import type { JsxRenderable } from '@ecopages/jsx';
import type { ErrorDiagnosticsProps } from './error-diagnostics.script';

export const ErrorDiagnostics = eco.component<ErrorDiagnosticsProps, JsxRenderable>({
	dependencies: {
		scripts: [{ src: './error-diagnostics.script.tsx', ssr: true }],
		stylesheets: ['./error-diagnostics.css'],
	},
	render: ({ message, stack }) => {
		return <radiant-error-diagnostics prop:message={message} prop:stack={stack} />;
	},
});
