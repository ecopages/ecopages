// Proposal definitions: github.com/webcomponents-cg/community-protocols/blob/main/proposals/context.md#definitions

import type { LiteElement } from '@eco-pages/lite-elements';

/**
 * A context key.
 *
 * A context key can be any type of object, including strings and symbols. The
 *  Context type brands the key type with the `__context__` property that
 * carries the type of the value the context references.
 */
export type Context<KeyType, ValueType> = KeyType & { __context__: ValueType };

/**
 * An unknown context type
 */
export type UnknownContext = Context<unknown, unknown>;

/**
 * A helper type which can extract a Context value type from a Context type
 */
export type ContextType<T extends UnknownContext> = T extends Context<infer _, infer V> ? V : never;

/**
 * A function which creates a Context value object
 */
export const createContext = <ValueType>(key: unknown) => key as Context<typeof key, ValueType>;

/**
 * A callback which is provided by a context requester and is called with the value satisfying the request.
 * This callback can be called multiple times by context providers as the requested value is changed.
 */
export type ContextCallback<ValueType> = (value: ValueType, unsubscribe?: () => void) => void;

/**
 * List of events which can be emitted by a context provider or requester.
 */
export enum ContextEventsTypes {
  SUBSCRIPTION_REQUEST = 'context--subscription-request',
  CONTEXT_REQUEST = 'context-request',
  ON_MOUNT = 'context--on-mount',
}

/**
 * An event fired by a context requester to signal it desires a named context.
 *
 * A provider should inspect the `context` property of the event to determine if it has a value that can
 * satisfy the request, calling the `callback` with the requested value if so.
 *
 * If the requested context event contains a truthy `subscribe` value, then a provider can call the callback
 * multiple times if the value is changed, if this is the case the provider should pass an `unsubscribe`
 * function to the callback which requesters can invoke to indicate they no longer wish to receive these updates.
 */
export class ContextRequestEvent<T extends UnknownContext> extends Event {
  public constructor(
    public readonly context: T,
    public readonly callback: ContextCallback<ContextType<T>>,
    public readonly subscribe?: boolean,
  ) {
    super(ContextEventsTypes.CONTEXT_REQUEST, { bubbles: true, composed: true });
  }
}

/**
 * A type which represents a subscription to a context value.
 */
export type ContextSubscription<T extends UnknownContext> = {
  selector?: keyof ContextType<T>;
  callback: (value: ContextType<T>) => void;
};

/**
 * An event fired by a context provider to signal that a context value has been mounted and is available for consumption.
 */
export class ContextOnMountEvent extends CustomEvent<{ context: UnknownContext }> {
  public constructor(context: UnknownContext) {
    super(ContextEventsTypes.ON_MOUNT, {
      detail: { context },
      bubbles: true,
      composed: true,
    });
  }
}

/**
 * An event fired by a context requester to signal it desires a named context.
 *
 * A provider should inspect the `context` property of the event to determine if it has a value that can
 * satisfy the request, calling the `callback` with the requested value if so.
 *
 * If the requested context event contains a truthy `subscribe` value, then a provider can call the callback
 * multiple times if the value is changed, if this is the case the provider should pass an `unsubscribe`
 * function to the callback which requesters can invoke to indicate they no longer wish to receive these updates.
 *
 * It accepts a `selector` property which can be used to request a specific property of the context value.
 */
export class ContextSubscriptionRequestEvent<T extends UnknownContext> extends Event {
  public constructor(
    public readonly context: T,
    public readonly callback: (value: ContextType<T> | { [K in keyof ContextType<T>]: ContextType<T>[K] }) => void,
    public readonly selector?: keyof ContextType<T>,
    public readonly subscribe?: boolean,
  ) {
    super(ContextEventsTypes.SUBSCRIPTION_REQUEST, {
      bubbles: true,
      composed: true,
    });
  }
}

declare global {
  interface HTMLElementEventMap {
    /**
     * A 'context-request-subscription' event can be emitted by any element which desires
     * a context value to be injected by an external provider.
     */
    [ContextEventsTypes.SUBSCRIPTION_REQUEST]: ContextSubscriptionRequestEvent<UnknownContext>;
    /**
     * A context-request-provider event can be emitted by a context requester to signal
     * that it desires a context value to be provided by a context provider.
     */
    [ContextEventsTypes.CONTEXT_REQUEST]: ContextRequestEvent<Context<unknown, unknown>>;
    /**
     * A 'context-mount' event can be emitted by a context provider to signal
     * that a context value has been mounted and is available for consumption.
     */
    [ContextEventsTypes.ON_MOUNT]: ContextOnMountEvent;
  }
}

type ContextProviderOptions<T extends UnknownContext> = {
  context: UnknownContext;
  initialValue?: ContextType<T>;
};

export class ContextProvider<T extends Context<unknown, unknown>> {
  private host: LiteElement;
  private context: UnknownContext;
  private value: ContextType<T> | undefined;
  subscriptions: ContextSubscription<T>[] = [];

  constructor(host: LiteElement, options: ContextProviderOptions<T>) {
    this.host = host;
    this.context = options.context;
    if (options.initialValue) this.value = options.initialValue as ContextType<T>;
    this.registerEvents();
    this.host.dispatchEvent(new ContextOnMountEvent(this.context));
  }

  setContext = (update: Partial<ContextType<T>>, callback?: (context: ContextType<T>) => void) => {
    if (typeof this.value === 'object') {
      const oldContext = { ...this.value };
      this.value = { ...this.value, ...update };
      if (callback) callback(this.value);
      this.notifySubscribers(this.value, oldContext);
    }
  };

  getContext = () => {
    return this.value as ContextType<T>;
  };

  private notifySubscribers = (newContext: ContextType<T>, prevContext: ContextType<T>) => {
    for (const sub of this.subscriptions) {
      if (!sub.selector) return this.sendSubscriptionUpdate(sub, newContext);
      const newSelected = newContext[sub.selector];
      const prevSelected = prevContext[sub.selector];
      if (newSelected !== prevSelected) {
        this.sendSubscriptionUpdate(sub, newContext);
      }
    }
  };

  sendSubscriptionUpdate = ({ selector, callback }: ContextSubscription<T>, context: ContextType<T>) => {
    if (!selector) callback(context);
    else
      callback({ [selector]: context[selector] } as {
        [K in keyof ContextType<T>]: ContextType<T>[K];
      });
  };

  onSubscriptionRequest = (event: ContextSubscriptionRequestEvent<UnknownContext>) => {
    const { context, callback, subscribe, selector, target } = event;
    console.log('onSubscriptionRequest', event);
    if (context !== this.context) return;
    event.stopPropagation();

    (target as HTMLElement).dispatchEvent(new ContextOnMountEvent(this.context));

    if (subscribe) {
      this.subscribe({ selector, callback });
    }

    if (selector) {
      callback({ [selector]: this.context[selector] } as {
        [K in keyof ContextType<T>]: ContextType<T>[K];
      });
    } else {
      callback(this.context as ContextType<T>);
    }
  };

  onContextRequest = (event: ContextRequestEvent<UnknownContext>) => {
    const { context, callback } = event;
    if (context !== this.context) return;
    event.stopPropagation();
    console.log(this);
    callback(this);
  };

  subscribe = ({ selector, callback }: ContextSubscription<T>) => {
    this.subscriptions.push({ selector, callback });
  };

  registerEvents = () => {
    this.host.addEventListener(ContextEventsTypes.SUBSCRIPTION_REQUEST, this.onSubscriptionRequest);
    this.host.addEventListener(ContextEventsTypes.CONTEXT_REQUEST, this.onContextRequest);
  };
}
