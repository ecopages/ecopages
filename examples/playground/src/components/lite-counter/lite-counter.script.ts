import { LiteElement, customElement, onEvent, onUpdated, query, reactiveProp } from '@eco-pages/lite-elements';

export type LiteCounterProps = {
  count?: number;
};

@customElement('lite-counter')
export class LiteCounter extends LiteElement {
  @reactiveProp({ type: Number, reflect: true }) declare count: number;
  @query({ ref: 'count' }) countText!: HTMLElement;

  @onEvent({ ref: 'decrement', type: 'click' })
  decrement() {
    if (this.count > 0) this.count--;
  }

  @onEvent({ ref: 'increment', type: 'click' })
  increment() {
    this.count++;
  }

  @onUpdated('count')
  updateCount() {
    this.countText.textContent = this.count.toString();
  }
}

declare global {
  namespace JSX {
    interface IntrinsicElements {
      'lite-counter': HtmlTag & LiteCounterProps;
    }
  }
}
