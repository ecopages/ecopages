import { describe, expect, test } from 'bun:test';
import { LiteElement, type RenderInsertPosition } from '@/core/lite-element';
import { reactiveProp } from '..';
import { WithKita } from './with-kita';

const Message = ({ children, extra }: { children: string; extra: string }) => {
  return (
    <p>
      {children as 'safe'} {extra as 'safe'}
    </p>
  );
};

class MyWithKitaElement extends WithKita(LiteElement) {
  @reactiveProp({ type: String }) insert: RenderInsertPosition = 'replace';
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
      insert: this.insert,
    });
  }
}

customElements.define('my-with-kita-element', MyWithKitaElement);

describe('WithKita', () => {
  test('it renders template correctly using insert: replace', () => {
    const element = document.createElement('my-with-kita-element');
    document.body.appendChild(element);
    expect(element.innerHTML).toEqual('<div><h1>My Lite Element</h1><p>Hello World</p></div>');
  });
  test('it renders template correctly using insert: beforeend', () => {
    const element = document.createElement('my-with-kita-element');
    const contents = '<span>existing contents</span>';
    element.innerHTML = contents;
    // @ts-expect-error
    element.insert = 'beforeend';
    document.body.appendChild(element);
    expect(element.innerHTML).toEqual(`${contents}<div><h1>My Lite Element</h1><p>Hello World</p></div>`);
  });

  test('it renders template correctly using insert: afterbegin', () => {
    const element = document.createElement('my-with-kita-element');
    const contents = '<span>existing contents</span>';
    element.innerHTML = contents;
    // @ts-expect-error
    element.insert = 'afterbegin';
    document.body.appendChild(element);
    expect(element.innerHTML).toEqual(`<div><h1>My Lite Element</h1><p>Hello World</p></div>${contents}`);
  });
});
