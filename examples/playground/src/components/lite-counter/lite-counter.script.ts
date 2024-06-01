import { RadiantElement, customElement, onEvent, onUpdated, query, reactiveProp } from '@ecopages/radiant';

export type LiteCounterProps = {
  count?: number;
};

@customElement('lite-counter')
export class LiteCounter extends RadiantElement {
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
