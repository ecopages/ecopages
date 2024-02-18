/**
 * A decorator to query all elements in the light DOM.
 * @param selector The selector to query.
 * @param on  The element to query on. Default is "this", which means the element itself.
 * @returns Returns the query result.
 */
export function querySelectorAll(selector: string, on?: "this" | "document") {
  const values = new WeakMap<any, Element[]>();

  return function (proto: any, propertyKey: string | symbol) {
    const getter = function (this: any) {
      let value = values.get(this);
      if (!value) {
        value =
          on === "document"
            ? [...document.querySelectorAll(selector)]
            : [...this.querySelectorAll(selector)];
        values.set(this, value || []);
      }
      return value || [];
    };

    Object.defineProperty(proto, propertyKey, {
      get: getter,
      enumerable: true,
      configurable: true,
    });
  };
}
