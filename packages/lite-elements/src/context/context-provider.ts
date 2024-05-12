import type { LiteElement } from '@/core/LiteElement';
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
  initialValue?: ContextType<T>;
};

export class LiteContext<T extends Context<unknown, unknown>> {
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
