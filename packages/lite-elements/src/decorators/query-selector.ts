/**
 * A decorator to query an element in the light DOM.
 * @param selector The selector to query.
 * @param on  The element to query on. Default is "this", which means the element itself.
 * @returns Returns the query result.
 */
export function querySelector(selector: string, on?: 'this' | 'document') {
  const values = new WeakMap<WeakKey, Element | null>();

  return (proto: unknown, propertyKey: string | symbol) => {
    const getter = function (this: Element) {
      let value = values.get(this);
      if (!value) {
        value = on === 'document' ? document.querySelector(selector) : this.querySelector(selector);
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
