import path from 'node:path';
import { createLogger, defineConfig, type Logger } from 'vite';
import { ecopages } from '@ecopages/vite-plugin';
import appConfig from './eco.config';

const configRoot = import.meta.dirname;
const generatedDirs = ['.e2e', 'dist', '.eco'];
const scopedArtifactGlobs = ['**/dist-*/**', '**/.eco-*/**'];
const isCrossIntegrationE2e = process.env.ECOPAGES_CROSS_INTEGRATION_E2E === 'true';

function createCrossIntegrationE2eLogger(): Logger {
	const logger = createLogger('warn');
	const passthrough = (method: 'warn' | 'error') => (message: string, options?: { timestamp?: boolean }) => {
		if (
			message.includes('dynamic import cannot be analyzed') ||
			message.includes('Pre-transform error: Failed to load url /assets/')
		) {
			return;
		}

		logger[method](message, options);
	};

	logger.warn = passthrough('warn');
	logger.error = passthrough('error');
	return logger;
}

function toPosixPath(value: string) {
	return value.split(path.sep).join('/');
}

const ignoredWatchPaths = Array.from(
	new Set([
		...generatedDirs.flatMap((dir) => {
			const absoluteDir = path.resolve(configRoot, dir);
			const relativeDir = toPosixPath(path.relative(configRoot, absoluteDir));

			return [`${absoluteDir}/**`, `**/${relativeDir}/**`];
		}),
		...scopedArtifactGlobs,
	]),
);

export default defineConfig({
	logLevel: isCrossIntegrationE2e ? 'warn' : 'info',
	customLogger: isCrossIntegrationE2e ? createCrossIntegrationE2eLogger() : undefined,
	plugins: [
		ecopages({
			appConfig,
		}),
	],
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
