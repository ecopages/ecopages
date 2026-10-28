import { AsyncLocalStorage } from 'node:async_hooks';

export const SERVER_BUNDLE_CONTEXT_KEY = '@ecopages/server-bundle-context';

export const SERVER_BUNDLE_IMPLEMENTATION_FILENAME = 'app.bundle.mjs';

const SERVER_BUNDLE_DIR_KEY = `${SERVER_BUNDLE_CONTEXT_KEY}/dir`;

function getServerBundleStorage(): AsyncLocalStorage<string> {
	const storageKey = Symbol.for(SERVER_BUNDLE_CONTEXT_KEY);
	const existingStorage = Reflect.get(globalThis, storageKey);
	if (existingStorage instanceof AsyncLocalStorage) return existingStorage as AsyncLocalStorage<string>;

	const storage = new AsyncLocalStorage<string>();
	Object.defineProperty(globalThis, storageKey, { value: storage, configurable: true });
	return storage;
}

/**
 * Returns the folder of the production server bundle running this application.
 *
 * @remarks
 * Node scopes the folder to the bundle's async import, so two bundles loaded in one process each see their own.
 * Bun does not carry `AsyncLocalStorage` into a module loaded through `import()`, so the loader also records the
 * folder of the last bundle it started on `globalThis`, and that value is the fallback.
 */
export function getProductionServerBundleDir(): string | undefined {
	const bundleDir = getServerBundleStorage().getStore() ?? Reflect.get(globalThis, Symbol.for(SERVER_BUNDLE_DIR_KEY));
	return typeof bundleDir === 'string' ? bundleDir : undefined;
}

export function runWithProductionServerBundleDir<T>(serverBundleDir: string, callback: () => T): T {
	return getServerBundleStorage().run(serverBundleDir, callback);
}

/** Emits a loader that scopes the bundle directory to that application's async import. */
export function createServerBundleLoaderSource(): string {
	return [
		"import { AsyncLocalStorage } from 'node:async_hooks';",
		"import { fileURLToPath } from 'node:url';",
		"const serverBundleDir = fileURLToPath(new URL('.', import.meta.url));",
		`const storageKey = Symbol.for(${JSON.stringify(SERVER_BUNDLE_CONTEXT_KEY)});`,
		'let storage = Reflect.get(globalThis, storageKey);',
		'if (!(storage instanceof AsyncLocalStorage)) {',
		'\tstorage = new AsyncLocalStorage();',
		'\tObject.defineProperty(globalThis, storageKey, { value: storage, configurable: true });',
		'}',
		`Object.defineProperty(globalThis, Symbol.for(${JSON.stringify(SERVER_BUNDLE_DIR_KEY)}), { value: serverBundleDir, configurable: true });`,
		`await storage.run(serverBundleDir, () => import('./${SERVER_BUNDLE_IMPLEMENTATION_FILENAME}'));`,
		'',
	].join('\n');
}
