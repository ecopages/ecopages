const originalConsoleWarn = console.warn;

/**
 * Suppresses the warning about CustomElementRegistry already being defined in ssr-dom-shim by lit
 * https://github.com/lit/lit/blob/bd881370b83d366f7654dd510731242a68949a20/packages/labs/ssr-dom-shim/src/index.ts#L140
 * Complete Error Log:
 * 'CustomElementRegistry' already has "lit-counter" defined. This may have been caused by live reload or hot module replacement in which case it can be safely ignored.
 * Make sure to test your application with a production build as repeat registrations will throw in production.
 */
console.warn = (...messages: any[]) => {
	if (
		messages.some(
			(message) => typeof message === 'string' && message.includes("'CustomElementRegistry' already has"),
		)
	) {
		return;
	}
	originalConsoleWarn.apply(console, messages);
};
