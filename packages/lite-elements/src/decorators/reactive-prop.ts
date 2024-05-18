import type { LiteElement } from '@/core/lite-element';
import {
  type AttributeTypeConstant,
  defaultValueForType,
  readAttributeValue,
  writeAttributeValue,
} from '@/utils/values';

type ReactivePropertyOptions = {
  type: AttributeTypeConstant;
  reflect?: boolean;
  attribute?: string;
};

/**
 * A decorator to define a reactive property.
 * Every time the property changes, the `updated` method will be called.
 * @param options The options for the reactive property.
 * @param options.type The type of the property value.
 * @param options.reflect Whether to reflect the property to the attribute.
 * @param options.attribute The name of the attribute.
 */
export function reactiveProp({ type, attribute, reflect }: ReactivePropertyOptions) {
  return (proto: LiteElement, propertyKey: string) => {
    const originalValues = new WeakMap<WeakKey, unknown>();
    const prefixedPropertyKey = `__${propertyKey}`;
    const attributeKey = attribute ?? propertyKey;

    Object.defineProperty(proto, prefixedPropertyKey, {
      get: function () {
        if (!originalValues.has(this)) {
          const initialValue = this.getAttribute(attributeKey) ?? defaultValueForType(type);
          const value = readAttributeValue(initialValue, type);
          originalValues.set(this, value);
        }
        return originalValues.get(this);
      },
      set: function (newValue: string) {
        const oldValue = originalValues.get(this);
        if (oldValue === newValue) return;
        originalValues.set(this, newValue);
        if (reflect) this.setAttribute(attributeKey, writeAttributeValue(newValue, type));
        this.updated(propertyKey, oldValue, newValue);
      },
      enumerable: true,
      configurable: true,
    });

    Object.defineProperty(proto, propertyKey, {
      get: function () {
        return this[prefixedPropertyKey];
      },
      set: function (newValue: string) {
        this[prefixedPropertyKey] = newValue;
      },
      enumerable: true,
      configurable: true,
    });
  };
}
