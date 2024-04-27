import { StyledMixin } from '@/lib/lit/styled-mixin';
import { LitElement, html } from 'lit';
import { customElement, property } from 'lit/decorators.js';
import styles from './lit-counter.shadow.css';

export type LitCounterProps = {
  count?: number;
};

@customElement('lit-counter')
export class LitCounter extends StyledMixin(LitElement, [styles]) {
  @property({ type: Number }) count = 0;

  decrement() {
    if (this.count > 0) this.count--;
  }

  increment() {
    this.count++;
  }

  override render() {
    return html`
      <button @click=${this.decrement} aria-label="Decrement" class="decrement">
        -
      </button>
      <span>${this.count}</span>
      <button
        data-increment
        @click=${this.increment}
        aria-label="Increment"
        class="increment"
      >
        +
      </button>
    `;
  }
}

declare global {
  namespace JSX {
    interface IntrinsicElements {
      'lit-counter': HtmlTag & LitCounterProps;
    }
  }
}
