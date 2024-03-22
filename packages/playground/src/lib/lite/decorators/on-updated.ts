import type { LiteElement } from "@/lib/lite/LiteElement";

/**
 * A decorator to subscribe to an updated callback when a reactive field or property changes.
 * @param eventConfig The event configuration.
 */
export function onUpdated(key: string) {
  return function (proto: LiteElement, propName: string) {
    const originalUpdated = proto.updated;
    proto.updated = function (changedProperty: string, oldValue: any, newValue: any) {
      if (oldValue === newValue) return;
      if (changedProperty == key) {
        originalUpdated.call(this, key, oldValue, newValue);
        (this as any)[propName]();
      } else {
        originalUpdated.call(this, key, oldValue, newValue);
      }
    };
  };
}
