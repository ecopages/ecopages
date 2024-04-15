import type { LiteElement } from '@/lib/lite/LiteElement';

/**
 * A decorator to define a reactive field.
 * Every time the property changes, the `updated` method will be called.
 * Due the fact the value is always undefined before the first update,
 * we are adding a `isDefined` WeakSet to track if the property has been defined.
 * @param target The target element.
 * @param propertyKey The property key.
 */
export function reactiveField(proto: LiteElement, propertyKey: string) {
  const originalValues = new WeakMap<WeakKey, unknown>();
  const isDefined = new WeakSet<WeakKey>();

  Object.defineProperty(proto, propertyKey, {
    get: function () {
      return originalValues.get(this);
    },
    set: function (newValue: unknown) {
      if (isDefined.has(this)) {
        const oldValue = originalValues.get(this);
        if (oldValue !== newValue) {
          originalValues.set(this, newValue);
          this.updated(propertyKey, oldValue, newValue);
        }
      } else {
        originalValues.set(this, newValue);
        isDefined.add(this);
      }
    },
  });
}
