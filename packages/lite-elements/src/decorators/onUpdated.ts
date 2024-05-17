import type { LiteElement } from '@/core/LiteElement';

/**
 * A decorator to subscribe to an updated callback when a reactive field or property changes.
 * @param eventConfig The event configuration.
 */
export function onUpdated(key: string) {
  return (proto: LiteElement, propName: string) => {
    const originalUpdated = proto.updated;
    proto.updated = function (changedProperty: string, oldValue: unknown, newValue: unknown) {
      if (oldValue === newValue) return;
      if (changedProperty === key) {
        originalUpdated.call(this, key, oldValue, newValue);
        (this as any)[propName]();
      } else {
        originalUpdated.call(this, key, oldValue, newValue);
      }
    };
  };
}
