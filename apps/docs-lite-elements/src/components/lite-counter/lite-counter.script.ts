import {
  LiteElement,
  customElement,
  onEvent,
  onUpdated,
  querySelector,
  reactiveAttribute,
} from '@eco-pages/lite-elements';

export type LiteCounterProps = {
  count?: number;
};

@customElement('lite-counter')
export class LiteCounter extends LiteElement {
  @reactiveAttribute({ type: Number, reflect: true }) declare count: number;
  @querySelector('[data-text]') countText!: HTMLElement;

  @onEvent({ target: '[data-decrement]', type: 'click' })
  decrement() {
    if (this.count > 0) this.count--;
  }

  @onEvent({ target: '[data-increment]', type: 'click' })
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
