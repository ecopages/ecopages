import { eco } from '@ecopages/core';
import type { JsxRenderable } from '@ecopages/jsx';
import { insetControls } from '../lib/settings';
import { systemAppearanceScript } from '../lib/system-appearance';

export default eco.html<JsxRenderable>({
	render: ({ children, metadata, headContent }) => (
		<html lang="en" data-rui-theme="zed" data-inset-controls={insetControls ? 'true' : undefined}>
			<head>
				<meta charset="utf-8" />
				<meta name="viewport" content="width=device-width, initial-scale=1" />
				<meta name="color-scheme" content="light dark" />
				<script safe>{systemAppearanceScript}</script>
				<title>{metadata.title}</title>
				{headContent}
			</head>
			{children}
		</html>
	),
});
