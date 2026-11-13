import type { ElectrobunConfig } from 'electrobun';

const iconset = 'desktop/ecopages.iconset';
const icon = `${iconset}/icon_512x512.png`;

export default {
	app: { name: 'Workspace', identifier: 'app.ecopages.workspace', version: '0.1.0' },
	build: {
		mainProcess: 'bun',
		bun: { entrypoint: 'desktop/main.ts' },
		mac: { icons: iconset },
		win: { icon },
		linux: { icon },
		copy: process.env.WORKSPACE_DEV_ROOT
			? {}
			: {
					dist: 'web/dist',
					'.desktop-runtime/node_modules': 'web/node_modules',
				},
	},
	runtime: { exitOnLastWindowClosed: true },
} satisfies ElectrobunConfig;
