import { describe, expect, test } from 'bun:test';
import { LiteElement } from '@/core/lite-element';
import { customElement } from '@/decorators/custom-element';
import { onUpdated } from '@/decorators/on-updated';
import { query } from '@/decorators/query';
import { reactiveProp } from '@/decorators/reactive-prop';

@customElement('lite-counter')
class LiteCounter extends LiteElement {
  @reactiveProp({ type: Number, reflect: true }) declare count: number;
  @query({ ref: 'count' }) countText!: HTMLElement;

  decrement() {
    if (this.count > 0) this.count--;
  }

  increment() {
    this.count++;
  }

  @onUpdated('count')
  updateCount() {
    this.countText.textContent = this.count.toString();
  }
}

const template = `
<lite-counter count="5">
  <button type="button" data-ref="decrement" aria-label="Decrement">
    -
  </button>
  <span data-ref="count">5</span>
  <button type="button" data-ref="increment" aria-label="Increment">
    +
  </button>
</lite-counter>`;

describe('@onUpdated', () => {
  test('decorator updates the element correctly', () => {
    document.body.innerHTML = template;
    const litEventListener = document.querySelector('lite-counter') as LiteCounter;
    expect(litEventListener.countText.innerHTML).toEqual('5');
    litEventListener.increment();
    expect(litEventListener.countText.innerHTML).toEqual('6');
    litEventListener.decrement();
    expect(litEventListener.countText.innerHTML).toEqual('5');
  });
});
