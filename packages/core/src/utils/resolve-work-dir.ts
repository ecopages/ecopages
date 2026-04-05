import path from 'node:path';
import { DEFAULT_ECOPAGES_WORK_DIR } from '../config/constants.ts';

type InternalPathConfig = {
	rootDir?: string;
	workDir?: string;
	absolutePaths?: {
		workDir?: string;
		distDir?: string;
	};
};

function isInsideNodeModules(directory: string): boolean {
	return path.normalize(directory).split(path.sep).includes('node_modules');
}

export function resolveInternalWorkDir(appConfig: InternalPathConfig): string {
	if (appConfig.absolutePaths?.workDir) {
		return appConfig.absolutePaths.workDir;
	}

	if (appConfig.rootDir) {
		return path.join(appConfig.rootDir, appConfig.workDir ?? DEFAULT_ECOPAGES_WORK_DIR);
	}

	if (appConfig.workDir) {
		return appConfig.workDir;
	}

	return DEFAULT_ECOPAGES_WORK_DIR;
}

export function resolveInternalExecutionDir(appConfig: InternalPathConfig): string {
	const workDir = resolveInternalWorkDir(appConfig);

	if (!isInsideNodeModules(workDir)) {
		return workDir;
	}

	if (appConfig.rootDir) {
		return path.join(appConfig.rootDir, DEFAULT_ECOPAGES_WORK_DIR);
	}

	return DEFAULT_ECOPAGES_WORK_DIR;
}
