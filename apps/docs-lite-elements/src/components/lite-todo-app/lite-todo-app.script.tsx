import {
  LiteElement,
  WithKita,
  customElement,
  onEvent,
  querySelector,
  reactiveAttribute,
} from '@eco-pages/lite-elements';
import { ContextProvider, createContext } from './context-provider';
import { consumeContext } from './decorators';

export type LiteTodoAppProps = {
  count?: number;
};

export type LiteTodoProps = {
  complete?: boolean;
};

type TodoContext = {
  todos: {
    id: string;
    text: string;
    complete: boolean;
  }[];
  count: number;
};

export const todoContext = createContext<TodoContext>(Symbol('todo-context'));

@customElement('lite-todo')
export class LiteTodo extends WithKita(LiteElement) {
  @querySelector('input[type="checkbox"]') checkbox!: HTMLElement;
  @reactiveAttribute({ type: Boolean, reflect: true }) complete = false;
  @consumeContext(todoContext) context!: ContextProvider<typeof todoContext>;

  override connectedCallback(): void {
    super.connectedCallback();
  }

  @onEvent({ target: 'input[type="checkbox"]', type: 'change' })
  toggleComplete(event: Event) {
    const checkbox = event.target as HTMLInputElement;
    console.log(this.context);
    const todo = this.context.getContext().todos.find((t) => t.id === this.id);
    if (!todo) return;
    todo.complete = checkbox.checked;
    this.complete = checkbox.checked;
  }
}

@customElement('lite-todo-app')
export class LiteTodos extends WithKita(LiteElement) {
  @querySelector('[data-count]') countText!: HTMLElement;
  @querySelector('[data-todo-list]') todoList!: HTMLElement;

  provider = new ContextProvider<typeof todoContext>(this, {
    context: todoContext,
    initialValue: {
      todos: [],
      count: 0,
    },
  });

  override connectedCallback(): void {
    super.connectedCallback();
    this.updateCount = this.updateCount.bind(this);
    this.handleTodos = this.handleTodos.bind(this);
    const context = this.provider.getContext();
    this.provider.subscribe({ selector: 'count', callback: this.updateCount });
    this.provider.subscribe({ selector: 'todos', callback: this.handleTodos });
  }

  addTodo(todo: string) {
    const prevTodos = this.provider.getContext().todos;
    const todos = [...prevTodos, { id: Date.now().toString(), text: todo, complete: false }];
    this.provider.setContext({ todos, count: todos.length });
  }

  @onEvent({ target: '[data-todo-form]', type: 'submit' })
  submitTodo(event: FormDataEvent) {
    event.preventDefault();
    const form = event.target as HTMLFormElement;
    const formData = new FormData(form);
    const todo = formData.get('todo');

    if (todo) {
      this.addTodo(todo.toString());
      form.reset();
    }
  }

  updateCount({ count }: TodoContext) {
    this.countText.textContent = count.toString();
  }

  handleTodos({ todos }: TodoContext) {
    const latestTodo = todos.at(-1);
    if (!latestTodo) return;
    this.renderTemplate({
      target: this.todoList,
      template: (
        <lite-todo complete={false} class="todo-item" id={latestTodo.id}>
          {latestTodo.text as 'safe'}
          <span>
            <input type="checkbox" checked={latestTodo.complete} />
          </span>
        </lite-todo>
      ),
      insert: todos.length === 1 ? 'replace' : 'beforeend',
    });
  }
}

declare global {
  namespace JSX {
    interface IntrinsicElements {
      'lite-todo-app': HtmlTag & LiteTodoAppProps;
      'lite-todo': HtmlTag & LiteTodoProps;
    }
  }
}
