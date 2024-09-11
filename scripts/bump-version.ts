import path from 'node:path';
import { Logger } from '@ecopages/logger';
import rootPackage from '../package.json';

if (!rootPackage.version) {
  throw new Error('Root package.json does not have a version');
}

type BumbType = 'major' | 'minor' | 'patch';

const bump: BumbType = (process.argv[2] as BumbType) || 'patch';

const appLogger = new Logger('[@ecopages/bump-version]');

const currentVersionParts = rootPackage.version.split('.');

const bumpIndex = {
  major: 0,
  minor: 1,
  patch: 2,
};

if (!bumpIndex[bump]) {
  throw new Error(`Invalid bump type: ${bump}`);
}

currentVersionParts[bumpIndex[bump]] = String(Number(currentVersionParts[bumpIndex[bump]]) + 1);

if (bump === 'minor') {
  currentVersionParts[2] = '0';
}

if (bump === 'major') {
  currentVersionParts[1] = '0';
  currentVersionParts[2] = '0';
}

const newVersion = currentVersionParts.join('.');

appLogger.info(`Updating ${bump} version to v${newVersion}`);

rootPackage.version = newVersion;

const packageJsonPath = path.resolve(__dirname, '../package.json');

Bun.write(packageJsonPath, JSON.stringify(rootPackage, null, 2));
