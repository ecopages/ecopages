import { describe, expect, test } from 'bun:test';
import { LiteElement } from '@/core/lite-element';
import { query } from '@/decorators//query';
import { customElement } from '@/decorators/custom-element';

@customElement('my-query-element')
class MyQueryElement extends LiteElement {
  @query({ ref: 'my-ref' }) myRef!: HTMLDivElement;
  @query({ ref: 'my-ref', all: true }) myRefs!: HTMLDivElement[];
  @query({ selector: '.my-class' }) declare myClass: HTMLElement;
  @query({ selector: '.my-class', all: true }) declare myClasses: HTMLElement[];

  addElement() {
    const div = document.createElement('div');
    div.textContent = 'My Ref 3';
    div.setAttribute('data-ref', 'my-ref');
    this.appendChild(div);
  }
}

const template = `
<my-query-element>
  <div data-ref="my-ref">My Ref 1</div>
  <div data-ref="my-ref">My Ref 2</div>
  <div class="my-class">My Class 1</div>
  <div class="my-class">My Class 2</div>
  <div class="my-class">My Class 3</div>
</my-query-element>`;

describe('@query', () => {
  test('decorator queries ref correctly', () => {
    document.body.innerHTML = template;
    const myQueryElement = document.querySelector('my-query-element') as MyQueryElement;
    expect(myQueryElement.myRef.textContent).toEqual('My Ref 1');
  });

  test('decorator queries all refs correctly', () => {
    document.body.innerHTML = template;
    const myQueryElement = document.querySelector('my-query-element') as MyQueryElement;
    expect(myQueryElement.myRefs.length).toEqual(2);
    expect(myQueryElement.myRefs[0].textContent).toEqual('My Ref 1');
    expect(myQueryElement.myRefs[1].textContent).toEqual('My Ref 2');
  });

  test('decorator queries selector correctly', () => {
    document.body.innerHTML = template;
    const myQueryElement = document.querySelector('my-query-element') as MyQueryElement;
    expect(myQueryElement.myClass.textContent).toEqual('My Class 1');
  });

  test('decorator queries all selectors correctly', () => {
    document.body.innerHTML = template;
    const myQueryElement = document.querySelector('my-query-element') as MyQueryElement;
    expect(myQueryElement.myClasses.length).toEqual(3);
    expect(myQueryElement.myClasses[0].textContent).toEqual('My Class 1');
    expect(myQueryElement.myClasses[1].textContent).toEqual('My Class 2');
    expect(myQueryElement.myClasses[2].textContent).toEqual('My Class 3');
  });

  test('decorator queries ref correctly after adding element', () => {
    document.body.innerHTML = template;
    const myQueryElement = document.querySelector('my-query-element') as MyQueryElement;
    expect(myQueryElement.myRefs.length).toEqual(2);
    myQueryElement.addElement();
    expect(myQueryElement.myRefs.length).toEqual(3);
    expect(myQueryElement.myRefs[2].textContent).toEqual('My Ref 3');
  });
});
