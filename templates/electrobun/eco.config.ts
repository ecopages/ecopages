import { createHash } from 'node:crypto';
import { defineConfig } from '@ecopages/core/config';
import { ecopagesJsxPlugin } from '@ecopages/ecopages-jsx';
import { lightningCssProcessorPlugin } from '@ecopages/lightningcss-processor';
import { desktop, origin } from './src/lib/settings';
import { systemAppearanceScript } from './src/lib/system-appearance';

const scriptHashes = [systemAppearanceScript];
if (process.env.WORKSPACE_DEV_READY_PATH) scriptHashes.push("import '/_hmr_runtime.js';");

const desktopPolicy = [
	"default-src 'self'",
	`script-src 'self' ${scriptHashes.map((script) => `'sha256-${createHash('sha256').update(script).digest('base64')}'`).join(' ')}`,
	"style-src 'self' 'unsafe-inline'",
	"img-src 'self' data:",
	"frame-src 'none'",
	"object-src 'none'",
	"base-uri 'none'",
	"form-action 'self'",
];

const development = Boolean(process.env.WORKSPACE_DEV_READY_PATH);

if (development) {
	desktopPolicy.push(`connect-src 'self' ${origin.replace('http:', 'ws:')}`);
}

export default defineConfig({
	baseUrl: origin,
	defaultMetadata: { title: 'Workspace', description: 'A desktop workspace.' },
	headers: [
		{
			source: '/**',
			headers: {
				'X-Frame-Options': 'DENY',
				'X-Content-Type-Options': 'nosniff',
				...(desktop ? { 'Content-Security-Policy': desktopPolicy.join('; ') } : {}),
			},
		},
	],
	integrations: [ecopagesJsxPlugin()],
	processors: [lightningCssProcessorPlugin()],
});
