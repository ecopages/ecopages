import {
  type ContextProvider,
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

import { NoCompletedTodosMessage, NoTodosMessage, TodoList } from './lite-todo.templates';

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
  @consumeContext(todoContext) context!: ContextProvider<typeof todoContext>;

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
  provider!: ContextProvider<typeof todoContext>;

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
        this.renderTemplate({
          target: list,
          template: noTodosMessage,
        });
      } else {
        this.renderTemplate({
          target: list,
          template: <TodoList todos={todos} />,
        });
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
