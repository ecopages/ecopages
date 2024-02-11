import { LightElement } from "./LightElement";

export function querySelector(selector: string, on?: "this" | "document") {
  return function (target: any, propertyKey: string | symbol) {
    let _val: Element | null;
    const getter = function (this: any) {
      if (!_val) {
        _val = on === "document" ? document.querySelector(selector) : this.querySelector(selector);
      }
      return _val;
    };
    Object.defineProperty(target, propertyKey, {
      get: getter,
      enumerable: true,
      configurable: true,
    });
  };
}

export function querySelectorAll(selector: string, on?: "this" | "document") {
  return function (target: any, propertyKey: string | symbol) {
    let _val: Element | null;
    const getter = function (this: any) {
      if (!_val) {
        _val =
          on === "document" ? document.querySelectorAll(selector) : this.querySelectorAll(selector);
      }
      return _val;
    };
    Object.defineProperty(target, propertyKey, {
      get: getter,
      enumerable: true,
      configurable: true,
    });
  };
}

export function onUpdated(key: string) {
  return function (proto: any, propName: string) {
    const originalUpdated = proto.updated;
    proto.updated = function (changedProperties: Map<string | number | symbol, unknown>) {
      if (changedProperties.has(key)) {
        originalUpdated.call(this, changedProperties);
        this[propName]();
      } else {
        originalUpdated.call(this, changedProperties);
      }
    };
  };
}

export function onEvent(eventConfig: { target: string; type: string }) {
  return function (classTarget: LightElement, propertyKey: string, descriptor: PropertyDescriptor) {
    const originalMethod = descriptor.value;
    const originalConnectedCallback = classTarget.connectedCallback;

    classTarget.connectedCallback = function (this: LightElement) {
      originalConnectedCallback.call(this);
      const eventTarget = this.querySelector(eventConfig.target);
      if (!eventTarget) {
        throw new Error(`Could not find element with selector ${eventConfig.target}`);
      }
      this.subscribeEvent({
        target: eventTarget,
        type: eventConfig?.type,
        listener: originalMethod.bind(this),
      });
    };

    return descriptor;
  };
}
