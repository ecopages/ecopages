/**
 * A decorator to query a ref in the element.
 * The ref should be declared with a `data-ref` attribute.
 * @param dataRefSelector The selector to query the ref.
 */
export function ref(dataRefSelector: string) {
  return (proto: unknown, propertyKey: string | symbol) => {
    const getter = function (this: Element) {
      return this.querySelector(`[data-ref="${dataRefSelector}"]`);
    };

    Object.defineProperty(proto, propertyKey, {
      get: getter,
      enumerable: true,
      configurable: true,
    });
  };
}
