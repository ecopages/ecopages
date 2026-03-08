import { readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { Logger } from '@ecopages/logger';
import rootPackage from '../package.json';

const appLogger = new Logger('[JSR Sync Version]');

if (!rootPackage.version) {
	throw new Error('Root package.json does not have a version');
}

/**
 * Recursively find all jsr.json files
 */
function findJsrJsonFiles(dir: string): string[] {
	const results: string[] = [];
	for (const entry of readdirSync(dir)) {
		if (entry === 'node_modules') continue;
		const full = path.join(dir, entry);
		if (statSync(full).isDirectory()) {
			results.push(...findJsrJsonFiles(full));
		} else if (entry === 'jsr.json') {
			results.push(full);
		}
	}
	return results;
}

const packagesRoot = path.resolve(import.meta.dirname, '../packages');
const jsrFiles = findJsrJsonFiles(packagesRoot);

for (const jsrJson of jsrFiles) {
	const packageJson = jsrJson.replace('jsr.json', 'package.json');

	const modifiedPackageJsonConfig = JSON.parse(readFileSync(packageJson, 'utf-8'));
	modifiedPackageJsonConfig.version = rootPackage.version;

	const modifiedJsrConfig = JSON.parse(readFileSync(jsrJson, 'utf-8'));
	const previousVersion = modifiedJsrConfig.version;
	modifiedJsrConfig.version = rootPackage.version;

	writeFileSync(packageJson, JSON.stringify(modifiedPackageJsonConfig, null, 2), 'utf-8');
	writeFileSync(jsrJson, JSON.stringify(modifiedJsrConfig, null, 2), 'utf-8');

	appLogger.info(`${modifiedJsrConfig.name}: ${previousVersion} > ${rootPackage.version}`);
}

/**
 * Sync version to packages/ecopages package.json
 */
const npmPkgPath = path.resolve(import.meta.dirname, '../packages/ecopages/package.json');
const npmPkg = JSON.parse(readFileSync(npmPkgPath, 'utf-8'));
npmPkg.version = rootPackage.version;
writeFileSync(npmPkgPath, JSON.stringify(npmPkg, null, 2) + '\n', 'utf-8');

appLogger.info(`packages/ecopages: ${rootPackage.version}`);
