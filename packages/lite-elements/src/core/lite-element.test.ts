import { describe, expect, test } from 'bun:test';
import { LiteElement } from './lite-element';

class MyLiteElement extends LiteElement {}

customElements.define('my-lite-element', MyLiteElement);

describe('LiteElement', () => {
  test('it renders template correctly', () => {
    document.body.innerHTML = '<my-lite-element></my-lite-element>';
    const myElement = document.querySelector('my-lite-element') as MyLiteElement;
    const template = '<p>Hello, template!</p>';
    myElement?.renderTemplate({ target: myElement, template, insert: 'replace' });
    expect(myElement.innerHTML).toEqual(template);
  });

  test('it can subscribe to events', () => {
    document.body.innerHTML = '<my-lite-element></my-lite-element>';
    const myElement = document.querySelector('my-lite-element') as MyLiteElement;
    myElement.subscribeEvents([
      {
        id: 'my-id',
        selector: '[data-ref="click-me"] ',
        type: 'click',
        listener: () => console.log('Hello, event!'),
      },
      {
        id: 'my-id-2',
        selector: '[data-ref="click-it"] ',
        type: 'click',
        listener: () => console.log('Hello, event!'),
      },
    ]);
    // @ts-expect-error
    expect(myElement.eventSubscriptions.has('my-id')).toBeTruthy();
    // @ts-expect-error
    expect(myElement.eventSubscriptions.has('my-id-2')).toBeTruthy();
  });

  test('it can unsubscribe from events', () => {
    document.body.innerHTML = '<my-lite-element></my-lite-element>';
    const myElement = document.querySelector('my-lite-element') as MyLiteElement;
    myElement.subscribeEvents([
      {
        id: 'my-id',
        selector: '[data-ref="click-me"] ',
        type: 'click',
        listener: () => console.log('Hello, event!'),
      },
      {
        id: 'my-id-2',
        selector: '[data-ref="click-it"] ',
        type: 'click',
        listener: () => console.log('Hello, event!'),
      },
    ]);
    myElement.unsubscribeEvent('my-id');
    // @ts-expect-error
    expect(myElement.eventSubscriptions.has('my-id')).toBeFalsy();
    // @ts-expect-error
    expect(myElement.eventSubscriptions.has('my-id-2')).toBeTruthy();
  });
});
