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
  query,
  reactiveProp,
  ref,
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
export class LiteTodoItem extends WithKita(LiteElement) {
  @query({ selector: 'input[type="checkbox"]' }) checkbox!: HTMLInputElement;
  @query({ selector: 'button' }) removeButton!: HTMLButtonElement;
  @reactiveProp({ type: Boolean, reflect: true }) complete = false;
  @consumeContext(todoContext) context!: ContextProvider<typeof todoContext>;

  override connectedCallback(): void {
    super.connectedCallback();
    this.complete = this.checkbox.checked;
  }

  @onEvent({ selector: 'input[type="checkbox"]', type: 'change' })
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
  }

  @onEvent({ ref: 'remove-todo', type: 'click' })
  removeTodo() {
    this.context.setContext({
      todos: this.context.getContext().todos.filter((t) => t.id !== this.id),
    });

    const logger = this.context.getContext().logger;
    logger.log(`Todo ${this.id} removed`);
  }
}

@customElement('lite-todo-app')
export class LiteTodoApp extends WithKita(LiteElement) {
  @query({ ref: 'list-complete' }) listComplete!: HTMLElement;
  @query({ ref: 'list-incomplete' }) listIncomplete!: HTMLElement;
  @query({ ref: 'count-complete' }) countComplete!: HTMLElement;
  @query({ ref: 'count-incomplete' }) countIncomplete!: HTMLElement;

  @provideContext<typeof todoContext>({
    context: todoContext,
    initialValue: { todos: [], logger: new Logger() },
    hydrate: Object,
  })
  provider!: ContextProvider<typeof todoContext>;

  @onEvent({ selector: 'form', type: 'submit' })
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
      { todos: todosCompleted, list: this.listComplete, noTodosMessage: <NoTodosMessage /> },
      { todos: todosIncomplete, list: this.listIncomplete, noTodosMessage: <NoCompletedTodosMessage /> },
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

    this.countComplete.textContent = todosCompleted.length.toString();
    this.countIncomplete.textContent = todosIncomplete.length.toString();
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
