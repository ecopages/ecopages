import { describe, expect, test } from 'bun:test';
import { LiteElement } from '@/core/lite-element';
import { WithKita } from './with-kita';

const Message = ({ children, extra }: { children: string; extra: string }) => {
  return (
    <p>
      {children as 'safe'} {extra as 'safe'}
    </p>
  );
};

class MyWithKitaElement extends WithKita(LiteElement) {
  override connectedCallback(): void {
    super.connectedCallback();
    this.renderTemplate({
      target: this,
      template: (
        <div>
          <h1>My Lite Element</h1>
          <Message extra="World">Hello</Message>
        </div>
      ),
      insert: 'replace',
    });
  }
}

customElements.define('my-with-kita-element', MyWithKitaElement);

describe('WithKita', () => {
  test('it renders template correctly', () => {
    const element = document.createElement('my-with-kita-element');
    document.body.appendChild(element);

    expect(element.innerHTML).toEqual('<div><h1>My Lite Element</h1><p>Hello World</p></div>');
  });
});
