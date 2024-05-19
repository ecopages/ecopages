import { LiteElement } from '@eco-pages/lite-elements/core/lite-element';
import { customElement } from '@eco-pages/lite-elements/decorators/custom-element';
import { onEvent } from '@eco-pages/lite-elements/decorators/on-event';
import { onUpdated } from '@eco-pages/lite-elements/decorators/on-updated';
import { query } from '@eco-pages/lite-elements/decorators/query';
import { reactiveProp } from '@eco-pages/lite-elements/decorators/reactive-prop';

export type LiteCounterProps = {
  value?: number;
};

@customElement('lite-counter')
export class LiteCounter extends LiteElement {
  @reactiveProp({ type: Number, reflect: true }) declare value: number;
  @query({ ref: 'count' }) countText!: HTMLElement;

  @onEvent({ ref: 'decrement', type: 'click' })
  decrement() {
    if (this.value > 0) this.value--;
  }

  @onEvent({ ref: 'increment', type: 'click' })
  increment() {
    this.value++;
  }

  @onUpdated('value')
  updateCount() {
    this.countText.textContent = this.value.toString();
  }
}

declare global {
  namespace JSX {
    interface IntrinsicElements {
      'lite-counter': HtmlTag & LiteCounterProps;
    }
  }
}
