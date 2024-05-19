/**
 * A decorator to query an element in the light DOM.
 * @param selector The selector to query.
 * @param on  The element to query on. Default is "this", which means the element itself.
 * @returns Returns the query result.
 */
export function querySelector(selector: string, on?: 'this' | 'document') {
  return (proto: unknown, propertyKey: string | symbol) => {
    const getter = function (this: Element) {
      return on === 'document' ? document.querySelector(selector) : this.querySelector(selector);
    };

    Object.defineProperty(proto, propertyKey, {
      get: getter,
      enumerable: true,
      configurable: true,
    });
  };
}
