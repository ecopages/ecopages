import { describe, expect, test } from 'bun:test';
import { LiteElement } from '@/core/lite-element';
import { customElement } from '@/decorators/custom-element';
import { stringifyAttribute } from '..';
import { onUpdated } from './on-updated';
import { reactiveProp } from './reactive-prop';

@customElement('my-reactive-number')
class MyReactiveNumber extends LiteElement {
  @reactiveProp({ type: Number }) num!: number;

  add() {
    this.num++;
  }
}

const numberTemplate = '<my-reactive-number num="1"></my-reactive-number>';

@customElement('my-reactive-object')
class MyReactiveObject extends LiteElement {
  @reactiveProp({ type: Object }) data!: { name: string };

  changeName(name: string) {
    this.data.name = name;
  }
}

const objectTemplate = `<my-reactive-object data='${stringifyAttribute({ name: 'John' })}'></my-reactive-object>`;

@customElement('my-reactive-boolean')
class MyReactiveBoolean extends LiteElement {
  @reactiveProp({ type: Boolean }) bool = true;

  toggleBoolean() {
    this.bool = !this.bool;
  }
}

const booleanTemplate = '<my-reactive-boolean bool></my-reactive-boolean>';

@customElement('my-reactive-string')
class MyReactiveString extends LiteElement {
  @reactiveProp({ type: String }) name = 'John';

  changeName(name: string) {
    this.name = name;
  }
}

const stringTemplate = '<my-reactive-string name="John"></my-reactive-string>';

@customElement('my-reactive-reflect')
class MyReactiveReflect extends LiteElement {
  @reactiveProp({ type: Number, reflect: true }) count = 1;

  increment() {
    this.count++;
  }
}

const reflectTemplate = '<my-reactive-reflect count="1"></my-reactive-reflect>';

@customElement('my-reactive-not-reflect')
class MyReactiveNotReflect extends LiteElement {
  @reactiveProp({ type: Number, reflect: false }) count = 1;

  increment() {
    this.count++;
  }
}

const notReflectTemplate = '<my-reactive-not-reflect count="1"></my-reactive-not-reflect>';

@customElement('my-reactive-array')
class MyReactiveArray extends LiteElement {
  @reactiveProp({ type: Array }) names = ['John'];

  addName(name: string) {
    this.names.push(name);
  }
}

const arrayTemplate = '<my-reactive-array names="John"></my-reactive-array>';

describe('@reactiveField', () => {
  test('decorator updates the number correctly', () => {
    document.body.innerHTML = numberTemplate;
    const myReactiveField = document.querySelector('my-reactive-number') as MyReactiveNumber;
    expect(myReactiveField.num).toEqual(1);
    myReactiveField.add();
    expect(myReactiveField.num).toEqual(2);
  });

  test('decorator updates the object correctly', () => {
    document.body.innerHTML = objectTemplate;
    const myReactiveObject = document.querySelector('my-reactive-object') as MyReactiveObject;
    expect(myReactiveObject.data.name).toEqual('John');
    myReactiveObject.changeName('Jane');
    expect(myReactiveObject.data.name).toEqual('Jane');
  });

  test('decorator updates the boolean correctly', () => {
    document.body.innerHTML = booleanTemplate;
    const myReactiveBoolean = document.querySelector('my-reactive-boolean') as MyReactiveBoolean;
    expect(myReactiveBoolean.bool).toEqual(true);
    myReactiveBoolean.toggleBoolean();
    expect(myReactiveBoolean.bool).toEqual(false);
  });

  test('decorator updates the string correctly', () => {
    document.body.innerHTML = stringTemplate;
    const myReactiveString = document.querySelector('my-reactive-string') as MyReactiveString;
    expect(myReactiveString.name).toEqual('John');
    myReactiveString.changeName('Jane');
    expect(myReactiveString.name).toEqual('Jane');
  });

  test('decorator updates the reflect correctly', () => {
    document.body.innerHTML = reflectTemplate;
    const myReactiveReflect = document.querySelector('my-reactive-reflect') as MyReactiveReflect;
    expect(myReactiveReflect.count).toEqual(1);
    myReactiveReflect.increment();
    expect(myReactiveReflect.count).toEqual(2);
    expect(myReactiveReflect.getAttribute('count')).toEqual('2');
  });

  test('decorator updates the not reflect correctly', () => {
    document.body.innerHTML = notReflectTemplate;
    const myReactiveNotReflect = document.querySelector('my-reactive-not-reflect') as MyReactiveNotReflect;
    expect(myReactiveNotReflect.count).toEqual(1);
    myReactiveNotReflect.increment();
    expect(myReactiveNotReflect.count).toEqual(2);
    expect(myReactiveNotReflect.getAttribute('count')).toEqual('1');
  });

  test('decorator updates the array correctly', () => {
    document.body.innerHTML = arrayTemplate;
    const myReactiveArray = document.querySelector('my-reactive-array') as MyReactiveArray;
    expect(myReactiveArray.names).toEqual(['John']);
    myReactiveArray.addName('Jane');
    expect(myReactiveArray.names).toEqual(['John', 'Jane']);
  });
});
