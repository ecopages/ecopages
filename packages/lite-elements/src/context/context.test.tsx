import { describe, expect, test } from 'bun:test';
import { LiteElement } from '@/core/lite-element';
import { customElement } from '@/decorators/custom-element';
import type { ContextProvider } from './context-provider';
import { createContext } from './create-context';
import { consumeContext } from './decorators/consume-context';
import { contextSelector } from './decorators/context-selector';
import { provideContext } from './decorators/provide-context';

type TestContext = {
  value: number;
};

const testContext = createContext<TestContext>(Symbol('todo-context'));

@customElement('my-context-provider')
class MyContextProvider extends LiteElement {
  @provideContext<typeof testContext>({
    context: testContext,
    initialValue: { value: 1 },
    hydrate: Object,
  })
  context!: ContextProvider<typeof testContext>;

  updateContextValue() {
    this.context.setContext({ value: this.context.getContext().value + 1 });
  }
}

@customElement('my-context-consumer')
class MyContextConsumer extends LiteElement {
  @consumeContext(testContext) context!: ContextProvider<typeof testContext>;
  @contextSelector({ context: testContext, select: (context) => context.value })
  onUpdateValue(value: number) {
    this.innerHTML = value.toString();
  }
}

const template = '<my-context-provider><my-context-consumer></my-context-consumer></my-context-provider>';

describe('Context', () => {
  test('it provides and consumes context correctly', () => {
    document.body.innerHTML = template;
    const provider = document.querySelector('my-context-provider') as MyContextProvider;
    const consumer = document.querySelector('my-context-consumer') as MyContextConsumer;

    expect(consumer.innerHTML).toBe('1');
    provider.updateContextValue();
    expect(consumer.innerHTML).toBe('2');
  });
});
