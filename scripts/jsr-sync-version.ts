import { Logger } from '@ecopages/logger';
import rootPackage from '../package.json';

const appLogger = new Logger('[JSR Sync Version]');

if (!rootPackage.version) {
	throw new Error('Root package.json does not have a version');
}
const glob = new Bun.Glob('packages/**/*/jsr.json');

for await (const jsrJson of glob.scan()) {
	const packageJson = jsrJson.replace('jsr.json', 'package.json');

	const modifiedPackageJsonConfig = await Bun.file(packageJson).json();
	modifiedPackageJsonConfig.version = rootPackage.version;

	const modifiedJsrConfig = await Bun.file(jsrJson).json();
	const previousVersion = modifiedJsrConfig.version;
	modifiedJsrConfig.version = rootPackage.version;

	await Promise.all([
		Bun.write(packageJson, JSON.stringify(modifiedPackageJsonConfig, null, 2)),
		Bun.write(jsrJson, JSON.stringify(modifiedJsrConfig, null, 2)),
	]);

	appLogger.info(`${modifiedJsrConfig.name}: ${previousVersion} > ${rootPackage.version}`);
}

/**
 * Regenerate the ecopages meta-package to ensure it has the updated version
 * and points to the correct updated dependencies.
 */
import { spawnSync } from 'node:child_process';

const generateProc = spawnSync('bun', ['scripts/generate-meta-package.ts'], {
	stdio: 'inherit',
	cwd: process.cwd(),
});

if (generateProc.error) {
	appLogger.error('Failed to regenerate ecopages meta-package', generateProc.error);
}
