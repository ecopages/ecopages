import type { LiteElement } from '@/core/lite-element';

/**
 * A decorator to query all elements with a specific selector in the element.
 * @param selector The selector to query.
 * @param on  The element to query on. Default is "this", which means the element itself.
 * @returns Returns the query result.
 */
export function querySelectorAll(selector: string, on?: 'this' | 'document') {
  return (proto: LiteElement, propertyKey: string | symbol) => {
    const getter = function (this: Element) {
      return on === 'document' ? [...document.querySelectorAll(selector)] : [...this.querySelectorAll(selector)];
    };

    Object.defineProperty(proto, propertyKey, {
      get: getter,
      enumerable: true,
      configurable: true,
    });
  };
}
