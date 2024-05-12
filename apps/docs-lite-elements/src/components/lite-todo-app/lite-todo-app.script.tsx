import {
  type LiteContext,
  LiteElement,
  WithKita,
  consumeContext,
  contextSelector,
  createContext,
  customElement,
  onEvent,
  provideContext,
  querySelector,
  reactiveAttribute,
} from '@eco-pages/lite-elements';
import {} from '@eco-pages/lite-elements/src/context/context-provider';

import { NoCompletedTodosMessage, NoTodosMessage, TodoItem } from './lite-todo.templates';

export type LiteTodoAppProps = {
  initialdata?: TodoContext['todos'];
};

export type LiteTodoProps = {
  complete?: boolean;
};

export type Todo = {
  id: string;
  text: string;
  complete: boolean;
};

export type TodoContext = {
  todos: Todo[];
};

export const todoContext = createContext<TodoContext>(Symbol('todo-context'));

@customElement('lite-todo-item')
export class LiteTodo extends WithKita(LiteElement) {
  @querySelector('input[type="checkbox"]') checkbox!: HTMLInputElement;
  @reactiveAttribute({ type: Boolean, reflect: true }) complete = false;
  @consumeContext(todoContext) context!: LiteContext<typeof todoContext>;

  override connectedCallback(): void {
    super.connectedCallback();
    this.complete = this.checkbox.checked;
  }

  @onEvent({ target: 'input[type="checkbox"]', type: 'change' })
  toggleComplete(event: Event) {
    const checkbox = event.target as HTMLInputElement;
    const todo = this.context.getContext().todos.find((t) => t.id === this.id);
    if (!todo) return;
    this.complete = checkbox.checked;
    this.context.setContext({
      todos: this.context.getContext().todos.map((t) => (t.id === this.id ? { ...t, complete: checkbox.checked } : t)),
    });
    this.remove();
  }

  override disconnectedCallback(): void {
    super.disconnectedCallback();
  }
}

@customElement('lite-todo-app')
export class LiteTodos extends WithKita(LiteElement) {
  @querySelector('[data-count]') countText!: HTMLElement;
  @querySelector('[data-count-complete]') countTextComplete!: HTMLElement;
  @querySelector('[data-todo-list]') todoList!: HTMLElement;
  @querySelector('[data-todo-list-complete]') todoListComplete!: HTMLElement;
  @reactiveAttribute({ type: Array, reflect: false }) initialdata: TodoContext['todos'] = [];

  @provideContext<typeof todoContext>({ context: todoContext, initialValue: { todos: [] } })
  provider!: LiteContext<typeof todoContext>;

  override connectedCallback(): void {
    super.connectedCallback();
    this.onTodosUpdated = this.onTodosUpdated.bind(this);
  }

  override connectedContextCallback(_contextName: typeof todoContext): void {
    this.provider.setContext({ todos: this.initialdata });
  }

  @onEvent({ target: '[data-todo-form]', type: 'submit' })
  submitTodo(event: FormDataEvent) {
    event.preventDefault();
    const form = event.target as HTMLFormElement;
    const formData = new FormData(form);
    const todo = formData.get('todo');

    if (todo) {
      const prevTodos = this.provider.getContext().todos;
      const todos = [...prevTodos, { id: Date.now().toString(), text: todo.toString(), complete: false }];
      this.provider.setContext({ todos });
      form.reset();
    }
  }

  renderTodos(todos: TodoContext['todos'], node: HTMLElement) {
    node.innerHTML = '';
    let index = 0;
    for (const todo of todos) {
      this.renderTemplate({
        target: node,
        template: <TodoItem {...todo} />,
        insert: index === 0 ? 'replace' : 'beforeend',
      });
      index++;
    }
  }

  renderMessage(message: JSX.Element, node: HTMLElement) {
    this.renderTemplate({
      target: node,
      template: message,
      insert: 'replace',
    });
  }

  @contextSelector({
    context: todoContext,
    select: ({ todos }) => ({
      todosCompleted: todos.filter((todo) => todo.complete),
      todosIncomplete: todos.filter((todo) => !todo.complete),
    }),
  })
  onTodosUpdated({
    todosCompleted,
    todosIncomplete,
  }: {
    todosCompleted: TodoContext['todos'];
    todosIncomplete: TodoContext['todos'];
  }) {
    if (todosCompleted.length === 0) {
      this.renderMessage(<NoTodosMessage />, this.todoListComplete);
    } else {
      this.renderTodos(todosCompleted, this.todoListComplete);
    }

    if (todosIncomplete.length === 0) {
      this.renderMessage(<NoCompletedTodosMessage />, this.todoList);
    } else {
      this.renderTodos(todosIncomplete, this.todoList);
    }

    this.countTextComplete.textContent = todosCompleted.length.toString();
    this.countText.textContent = todosIncomplete.length.toString();
  }
}

declare global {
  namespace JSX {
    interface IntrinsicElements {
      'lite-todo-app': HtmlTag & LiteTodoAppProps;
      'lite-todo-item': HtmlTag & LiteTodoProps;
    }
  }
}
