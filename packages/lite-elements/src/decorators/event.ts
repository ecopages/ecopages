import { EventEmitter, type EventEmitterConfig } from '@/utils/event-emitter';

/**
 * A decorator that creates an EventEmitter on the target element.
 * The EventEmitter can be used to dispatch custom events from the target element.
 *
 * @param {EventEmitterConfig} eventConfig - The configuration for the EventEmitter.
 * This includes the event type, and optionally, whether the event should bubble and whether it should be composed.
 *
 * @returns {EventEmitter} - An EventEmitter instance that can be used to dispatch events from the target element.
 * The returned EventEmitter is read-only and cannot be reconfigured after it's created.
 *
 * @example
 * // Use the `event` decorator to create an EventEmitter for a custom event
 * @event({ type: 'my-event', bubbles: true, composed: true })
 * myEventEmitter!: EventEmitter;
 *
 * // Later, you can use the EventEmitter to dispatch the custom event
 * this.myEventEmitter.emit({ detail: { message: 'Hello, world!' } });
 *
 * @see {@link EventEmitter} for more details about how the EventEmitter works.
 */
export function event(eventConfig: EventEmitterConfig) {
  return (target: any, propertyKey: string) => {
    Object.defineProperty(target, propertyKey, {
      get() {
        Object.defineProperty(this, propertyKey, {
          value: new EventEmitter(this, eventConfig),
          writable: false,
          configurable: false,
        });
        return this[propertyKey];
      },
      configurable: true,
    });
  };
}
