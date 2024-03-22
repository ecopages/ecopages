/**
 * Registers a web component with the given name on the global `window.customElements` registry.
 * @param name selector name.
 */
export function customElement(name: string): ClassDecorator {
  return (target: any) => {
    if (window.customElements.get(name)) {
      throw new Error(`Already an element is registered with the name ${name}`);
    }
    window.customElements.define(name, target);
  };
}
