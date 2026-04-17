import path from 'node:path';
import { defineConfig } from 'vite';
import { ecopages } from '@ecopages/vite-plugin';
import appConfig from './eco.config';

const configRoot = import.meta.dirname;
const generatedDirs = ['.e2e', process.env.ECOPAGES_DIST_DIR, process.env.ECOPAGES_WORK_DIR].filter(
	(value): value is string => typeof value === 'string' && value.length > 0,
);

function toPosixPath(value: string) {
	return value.split(path.sep).join('/');
}

const ignoredWatchPaths = Array.from(
	new Set(
		generatedDirs.flatMap((dir) => {
			const absoluteDir = path.resolve(configRoot, dir);
			const relativeDir = toPosixPath(path.relative(configRoot, absoluteDir));

			return [`${absoluteDir}/**`, `**/${relativeDir}/**`];
		}),
	),
);

export default defineConfig({
	plugins: [ecopages({ appConfig })],
	server: {
		watch: {
			ignored: ignoredWatchPaths,
		},
	},
	resolve: {
		alias: {
			'@': path.resolve(import.meta.dirname, './src'),
		},
	},
});
