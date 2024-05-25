import type { LiteElement } from '@/core/lite-element';
import { type AttributeTypeConstant, readAttributeValue } from '@/utils/attribute-utils';
import {
  ContextEventsTypes,
  ContextOnMountEvent,
  type ContextRequestEvent,
  type ContextSubscription,
  type ContextSubscriptionRequestEvent,
} from './events';
import type { Context, ContextType, UnknownContext } from './types';

type ContextProviderOptions<T extends UnknownContext> = {
  context: UnknownContext;
  initialValue?: T['__context__'];
  hydrate?: AttributeTypeConstant;
};

export const HYDRATE_ATTRIBUTE = 'hydrate-context';

export class ContextProvider<T extends Context<unknown, unknown>> {
  private host: LiteElement;
  private context: UnknownContext;
  private value: ContextType<T> | undefined;
  subscriptions: ContextSubscription<T>[] = [];

  constructor(host: LiteElement, options: ContextProviderOptions<T>) {
    this.host = host;
    this.context = options.context;
    let contextValue: T['__context__'] | undefined = options.initialValue;

    if (options.hydrate) {
      const hydrationValue = this.host.getAttribute(HYDRATE_ATTRIBUTE);

      console.log('------------------->this.host.outerHTML', this.host.outerHTML);

      if (hydrationValue) {
        const parsedHydrationValue = readAttributeValue(hydrationValue, options.hydrate) as ContextType<T>;
        this.host.removeAttribute(HYDRATE_ATTRIBUTE);

        if (
          options.hydrate === Object &&
          this.isObject(parsedHydrationValue) &&
          (this.isObject(contextValue) || typeof contextValue === 'undefined')
        ) {
          contextValue = {
            ...(contextValue ?? {}),
            ...parsedHydrationValue,
          };
        } else {
          contextValue = parsedHydrationValue;
        }

        console.log('------------------->hydrated', contextValue);
      }
    }

    console.log('-----222222-------------->contextValue', contextValue);
    this.value = contextValue as ContextType<T>;

    this.registerEvents();
    this.host.dispatchEvent(new ContextOnMountEvent(this.context));
  }

  private isObject(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && !Array.isArray(value) && value !== null;
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
      if (!sub.select) return this.sendSubscriptionUpdate(sub, newContext);
      const newSelected = sub.select(newContext);
      const prevSelected = sub.select(prevContext);
      if (newSelected !== prevSelected) {
        this.sendSubscriptionUpdate(sub, newContext);
      }
    }
  };

  sendSubscriptionUpdate = ({ select, callback }: ContextSubscription<T>, context: ContextType<T>) => {
    if (!select) callback(context);
    else callback(select(context));
  };

  subscribe = ({ select, callback }: ContextSubscription<T>) => {
    this.subscriptions.push({ select, callback });
  };

  handleSubscriptionRequest = ({
    select,
    callback,
    subscribe,
  }: {
    select?: ContextSubscription<T>['select'];
    callback: ContextSubscription<T>['callback'];
    subscribe?: boolean;
  }) => {
    if (subscribe) this.subscribe({ select, callback });

    if (!this.value) return;

    if (select) {
      callback(select(this.value));
    } else {
      callback(this.value as ContextType<T>);
    }
  };

  onSubscriptionRequest = (event: ContextSubscriptionRequestEvent<UnknownContext>) => {
    const { context, callback, subscribe, select, target } = event;
    if (context !== this.context) return;

    event.stopPropagation();

    (target as HTMLElement).dispatchEvent(new ContextOnMountEvent(this.context));

    this.handleSubscriptionRequest({ select, callback, subscribe });
  };

  onContextRequest = (event: ContextRequestEvent<UnknownContext>) => {
    const { context, callback } = event;
    if (context !== this.context) return;
    event.stopPropagation();
    callback(this);
  };

  registerEvents = () => {
    this.host.addEventListener(ContextEventsTypes.SUBSCRIPTION_REQUEST, this.onSubscriptionRequest);
    this.host.addEventListener(ContextEventsTypes.CONTEXT_REQUEST, this.onContextRequest);
  };
}
