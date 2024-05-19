import type { LiteElement } from '@/core/lite-element';

/**
 * A decorator to query all ref in the element.
 * The refs should be declared with a `data-ref` attribute.
 * @param dataRefSelector The selector to query the ref.
 */
export function refAll(dataRefSelector: string) {
  return (proto: LiteElement, propertyKey: string | symbol) => {
    const getter = function (this: Element) {
      return [...this.querySelectorAll(`[data-ref="${dataRefSelector}"]`)];
    };

    Object.defineProperty(proto, propertyKey, {
      get: getter,
      enumerable: true,
      configurable: true,
    });
  };
}
