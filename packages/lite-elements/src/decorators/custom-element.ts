/**
 * Registers a web component with the given name on the global `window.customElements` registry.
 * @param name selector name.
 */
export function customElement(name: string) {
  return (target: CustomElementConstructor) => {
    if (!globalThis.window) return;
    if (!window.customElements.get(name)) {
      window.customElements.define(name, target);
    }
  };
}
