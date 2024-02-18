import type { LiteElement } from "@/lib/lite/LiteElement";

/**
 * A decorator to define a reactive field.
 * Every time the property changes, the `updated` method will be called.
 * @param target The target element.
 * @param propertyKey The property key.
 */
export function reactiveField(proto: LiteElement, propertyKey: string) {
  const originalValues = new WeakMap<any, any>();

  const originalValue = (proto as any)[propertyKey];

  originalValues.set(proto, originalValue);

  Object.defineProperty(proto, propertyKey, {
    get: function () {
      return originalValues.get(this);
    },
    set: function (newValue: any) {
      const oldValue = originalValues.get(this);
      originalValues.set(this, newValue);
      if (oldValue === newValue) return;
      this.updated(propertyKey, oldValue, newValue);
    },
  });
}
