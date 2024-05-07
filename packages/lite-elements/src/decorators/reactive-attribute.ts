import type { LiteElement } from '@/core/LiteElement';
import type { AttributeTypeConstant } from '@/types';
import { readAttributeValue, writeAttributeValue } from '@/utils';

/**
 * A decorator to define a reactive attribute.
 * Every time the property changes, the `updated` method will be called.
 * @param type The type of the value.
 * @param reflect Whether to reflect the attribute to the property.
 */
export function reactiveAttribute({
  type,
  reflect,
}: {
  type: AttributeTypeConstant;
  reflect?: boolean;
}) {
  return (proto: LiteElement, propertyKey: string) => {
    const originalValues = new WeakMap<WeakKey, unknown>();
    const attributeName = propertyKey.replace(/([A-Z])/g, '-$1').toLowerCase();

    Object.defineProperty(proto, propertyKey, {
      get: function () {
        switch (type) {
          case Boolean:
            return this.hasAttribute(attributeName);
          default:
            return readAttributeValue(this.getAttribute(attributeName), type);
        }
      },
      set: function (newValue: string) {
        const oldValue = originalValues.get(this);
        if (!oldValue) {
          const attributeValue = this.getAttribute(attributeName);
          originalValues.set(this, readAttributeValue(attributeValue, type));
        }
        if (oldValue === newValue) return;
        originalValues.set(this, newValue);
        if (reflect) this.setAttribute(attributeName, writeAttributeValue(newValue, type));
        this.updated(propertyKey, oldValue, newValue);
      },
      enumerable: true,
      configurable: true,
    });
  };
}
