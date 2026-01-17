/**
 * HMR script utilities for React components.
 * @module
 */

/** Marker comment to identify already-processed HMR code */
const HMR_MARKER = '/* [ecopages] react-hmr */';

/**
 * Checks if code has already been processed with HMR marker.
 * @param code - The bundled code to check
 * @returns True if the code already contains the HMR marker
 */
export function hasHmrMarker(code: string): boolean {
	return code.includes(HMR_MARKER);
}

/**
 * Injects HMR acceptance handler into bundled code.
 * When a module with React exports changes, it triggers a full invalidation
 * to ensure the parent module re-imports and re-renders with the updated component.
 * @param code - The bundled code to wrap
 * @returns Code with HMR handler injected
 */
export function injectHmrHandler(code: string): string {
	return `${HMR_MARKER}
${code}
if (import.meta.hot) {
  import.meta.hot.accept((newModule) => {
    if (newModule) {
      const exports = Object.keys(newModule);
      const hasReactExport = exports.some(key => {
        const value = newModule[key];
        return value && (
          typeof value === 'function' ||
          (typeof value === 'object' && value.$$typeof)
        );
      });
      
      if (hasReactExport) {
        import.meta.hot.invalidate();
      }
    }
  });
}
`;
}
