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
  reactiveProp,
} from '@eco-pages/lite-elements';

import { NoCompletedTodosMessage, NoTodosMessage, TodoItem } from './lite-todo.templates';

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
  logger: Logger;
};

export const todoContext = createContext<TodoContext>(Symbol('todo-context'));

class Logger {
  log(message: string) {
    console.log('%cLOGGER', 'background: #222; color: #bada55', message);
  }
}

@customElement('lite-todo-item')
export class LiteTodo extends WithKita(LiteElement) {
  @querySelector('input[type="checkbox"]') checkbox!: HTMLInputElement;
  @reactiveProp({ type: Boolean, reflect: true }) complete = false;
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

    const logger = this.context.getContext().logger;
    logger.log(`Todo ${this.id} is now ${checkbox.checked ? 'complete' : 'incomplete'}`);

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

  @provideContext<typeof todoContext>({
    context: todoContext,
    initialValue: { todos: [], logger: new Logger() },
    hydrate: Object,
  })
  provider!: LiteContext<typeof todoContext>;

  override connectedCallback(): void {
    super.connectedCallback();
    this.onTodosUpdated = this.onTodosUpdated.bind(this);
  }

  @onEvent({ target: 'form', type: 'submit' })
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
  onTodosUpdated({ todosCompleted, todosIncomplete }: Record<string, TodoContext['todos']>) {
    const todosMapping = [
      { todos: todosCompleted, list: this.todoListComplete, noTodosMessage: <NoTodosMessage /> },
      { todos: todosIncomplete, list: this.todoList, noTodosMessage: <NoCompletedTodosMessage /> },
    ];

    for (const { todos, list, noTodosMessage } of todosMapping) {
      if (todos.length === 0) {
        this.renderMessage(noTodosMessage, list);
      } else {
        this.renderTodos(todos, list);
      }
    }

    this.countTextComplete.textContent = todosCompleted.length.toString();
    this.countText.textContent = todosIncomplete.length.toString();
  }
}

declare global {
  namespace JSX {
    interface IntrinsicElements {
      'lite-todo-app': HtmlTag;
      'lite-todo-item': HtmlTag & LiteTodoProps;
    }
  }
}
