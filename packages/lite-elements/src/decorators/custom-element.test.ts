import { describe, expect, test } from 'bun:test';
import { LiteElement } from '@/core/lite-element';
import { customElement } from './custom-element';

@customElement('my-custom-element')
class MyCustomElement extends LiteElement {
  override connectedCallback(): void {
    super.connectedCallback();
    this.innerHTML = 'Hello, world!';
  }
}

describe('@customElement', () => {
  test('decorator register a custom element correctly', () => {
    document.body.innerHTML = '<my-custom-element></my-custom-element>';
    const myCustomElement = document.querySelector('my-custom-element') as MyCustomElement;
    expect(myCustomElement.innerHTML).toEqual('Hello, world!');
  });
});
