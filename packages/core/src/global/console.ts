const originalConsoleWarn = console.warn;

/**
 * Suppresses the warning about CustomElementRegistry already being defined in ssr-dom-shim by lit
 * https://github.com/lit/lit/blob/bd881370b83d366f7654dd510731242a68949a20/packages/labs/ssr-dom-shim/src/index.ts#L140
 */
console.warn = (message) => {
  if (message.includes("'CustomElementRegistry' already has")) {
    return;
  }
  originalConsoleWarn.apply(console, message);
};
