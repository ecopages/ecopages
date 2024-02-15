import type { LiteElement } from "../LiteElement";
import type { LiteContext } from "./lite-context";

export function provider<ContextState extends Record<string, unknown>>(contextId: string) {
  const contexts = new WeakMap<any, LiteContext<ContextState> | null>();

  return function (target: any, propertyKey: string | symbol) {
    const getter = function (this: any) {
      let context = contexts.get(this);
      if (!context) {
        context = this.closest(
          `lite-pkg-context[context-id="${contextId}"]`
        ) as LiteContext<ContextState> | null;
        if (!context) {
          throw new Error(`No context found with id: ${contextId}`);
        }
        contexts.set(this, context);
      }
      return context;
    };

    Object.defineProperty(target, propertyKey, {
      get: getter,
      enumerable: true,
      configurable: true,
    });
  };
}

export function subscribe<ContextState extends Record<string, unknown>>(options: {
  contextId: string;
  selector: string;
}) {
  return function (
    classTarget: LiteElement & { context?: LiteContext<ContextState> },
    propertyKey: string,
    descriptor: PropertyDescriptor
  ) {
    const originalMethod = descriptor.value;
    const originalConnectedCallback = classTarget.connectedCallback;
    // let targetContext = classTarget["context"];

    console.log("Connected callback");
    classTarget["connectedCallback"] = function (
      this: LiteElement & { context: LiteContext<ContextState> }
    ) {
      originalConnectedCallback.call(this);
      console.log(this.context);

      if (!this.context) {
        this.context = this.closest(
          `lite-pkg-context[context-id="${options.contextId}"]`
        ) as LiteContext<ContextState>;

        if (!this.context) {
          throw new Error(`No context found with id: ${options.contextId}`);
        }
      }

      this.context.subscribe({
        selector: options.selector,
        callback: originalMethod.bind(this),
      });
    };

    descriptor.value = function (...args: any[]) {
      const result = originalMethod.apply(this, args);
      return result;
    };

    return descriptor;
  };
}
