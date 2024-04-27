import { ContextEventsTypes } from '@/lib/lite/context/types';

/**
 * An event fired by a context provider to signal that a context value has been mounted and is available for consumption.
 */
export class ContextOnMountEvent extends CustomEvent<{ name: string }> {
  public constructor(name: string) {
    super(ContextEventsTypes.ON_MOUNT, {
      detail: { name },
      bubbles: true,
      composed: true,
    });
  }
}
