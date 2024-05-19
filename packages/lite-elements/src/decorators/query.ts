type BaseQueryConfig = {
  all?: boolean;
};

export type QueryConfig = BaseQueryConfig &
  (
    | {
        selector: string;
      }
    | {
        ref: string;
      }
  );

/**
 * A decorator to query by CSS selector or data-ref attribute.
 * By default it queries for the first element that matches the selector, but it can be configured to query for all elements.
 *
 * @param {QueryConfig} options - The configuration object for the query.
 * @param {boolean} [options.all] - A flag to query for all elements that match the selector. Defaults to `false`.
 * @param {string} [options.selector] - A CSS selector to match elements against. This property is mutually exclusive with `options.ref`.
 * @param {string} [options.ref] - A reference to an element. This property is mutually exclusive with `options.selector`.
 *
 * @returns {Function} A decorator function that, when applied to a class property, will replace it with a getter. The getter will return the result of the query when accessed.
 *
 * @example
 * class MyElement extends HTMLElement {
 *   @query({ selector: '.my-class' })
 *   myElement;
 * }
 *
 * // Now, `myElement` will return the first element in the light DOM of `MyElement` that matches the selector '.my-class'.
 */
export function query(options: QueryConfig) {
  return (proto: unknown, propertyKey: string | symbol) => {
    const getter = function (this: Element) {
      const selector = 'selector' in options ? options.selector : `[data-ref="${options.ref}"]`;
      const query = options.all ? this.querySelectorAll(selector) : this.querySelector(selector);
      return query;
    };

    Object.defineProperty(proto, propertyKey, {
      get: getter,
      enumerable: true,
      configurable: true,
    });
  };
}
