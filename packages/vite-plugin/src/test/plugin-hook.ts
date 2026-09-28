export function callPluginHook(hook: unknown, thisArg: unknown, ...args: unknown[]): unknown {
	if (!hook) {
		return undefined;
	}

	const fn = typeof hook === 'function' ? hook : (hook as { handler: (...args: unknown[]) => unknown }).handler;
	return fn.call(thisArg, ...args);
}
