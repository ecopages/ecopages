import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import Electrobun, { BrowserWindow, PATHS, Utils, type ElectrobunEvent } from 'electrobun/main';
import { origin, port } from '../src/lib/settings';
import { startLiveServer } from './live-server';

const useInsetControls = process.platform === 'darwin';
const devRoot = process.env.WORKSPACE_DEV_ROOT;
process.env.WORKSPACE_DATA_DIR ??= resolve(Utils.paths.userData, devRoot ? 'development' : 'data');
process.env.WORKSPACE_DESKTOP = '1';
process.env.WORKSPACE_INSET_CONTROLS = useInsetControls ? '1' : '0';

if (devRoot) {
	const cli = process.env.WORKSPACE_DEV_CLI;
	if (!cli) throw new Error('Start desktop development with pnpm desktop:dev.');
	const stop = await startLiveServer(devRoot, cli, origin, port);
	Electrobun.events.once('before-quit', stop);
} else {
	const webRoot = resolve(PATHS.RESOURCES_FOLDER, 'app', 'web');
	const serverDir = resolve(webRoot, 'dist', 'server');
	process.env.ECOPAGES_CONFIG_FILE = resolve(serverDir, 'eco.config.mjs');
	process.chdir(webRoot);
	await import(pathToFileURL(resolve(serverDir, 'app.mjs')).href);
}

const window = new BrowserWindow({
	title: 'Workspace',
	url: origin,
	frame: { width: 1040, height: 700 },
	titleBarStyle: useInsetControls ? 'hiddenInset' : 'hidden',
	navigationRules: JSON.stringify(['^*', `${origin}/*`]),
	allowedProtocols: { views: false, appData: false },
});

Electrobun.events.on(`host-message-${window.webview.id}`, ({ data }: ElectrobunEvent<{ detail: unknown }, unknown>) => {
	if (useInsetControls) return;
	switch (data.detail) {
		case 'workspace:minimize':
			window.minimize();
			break;
		case 'workspace:maximize':
			if (window.isMaximized()) window.unmaximize();
			else window.maximize();
			break;
		case 'workspace:close':
			window.close();
			break;
	}
});
