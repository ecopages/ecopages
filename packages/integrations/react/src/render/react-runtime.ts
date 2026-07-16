/**
 * Resolves the React and react-dom/server modules used for SSR.
 *
 * @remarks
 * Prefers the app's own React install so SSR identity matches the app bundle.
 * Falls back to the integration's React when the app package cannot resolve them.
 */

import { createRequire } from 'node:module';
import path from 'node:path';
import type { ReactRuntime } from './layout-compose.ts';

export type ReactRuntimeModules = {
	react: ReactRuntime;
	reactDomServer: typeof import('react-dom/server');
};

export function resolveReactRuntimeModules(rootDir: string | undefined): ReactRuntimeModules {
	const appPackageJsonPath = path.resolve(rootDir || process.cwd(), 'package.json');

	try {
		const requireFromApp = createRequire(appPackageJsonPath);

		return {
			react: requireFromApp('react') as ReactRuntime,
			reactDomServer: requireFromApp('react-dom/server'),
		};
	} catch {
		const requireFromIntegration = createRequire(import.meta.url);

		return {
			react: requireFromIntegration('react') as ReactRuntime,
			reactDomServer: requireFromIntegration('react-dom/server'),
		};
	}
}
