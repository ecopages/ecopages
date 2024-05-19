/**
 * A decorator to query a ref in the element.
 * The ref should be declared with a `data-ref` attribute.
 * @param dataRefSelector The selector to query the ref.
 */
export function ref(dataRefSelector: string) {
  const values = new WeakMap<WeakKey, Element | null>();

  return (proto: unknown, propertyKey: string | symbol) => {
    const getter = function (this: Element) {
      let value = values.get(this);
      if (!value) {
        value = this.querySelector(`[data-ref="${dataRefSelector}"]`);
        values.set(this, value || null);
      }

      return value || null;
    };

    Object.defineProperty(proto, propertyKey, {
      get: getter,
      enumerable: true,
      configurable: true,
    });
  };
}
