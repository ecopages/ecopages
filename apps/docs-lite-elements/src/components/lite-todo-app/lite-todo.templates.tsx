import type { Todo } from './lite-todo-app.script';

export const NoTodosMessage = () => {
  return <div>No todos to show</div>;
};

export const NoCompletedTodosMessage = () => {
  return <div>No completed todos to show</div>;
};

export const TodoItem = ({ id, complete, text }: Todo) => {
  return (
    <lite-todo-item complete={complete} class="todo__item" id={id}>
      <label for={`todo-${id}`}>
        <input id={`todo-${id}`} name={id} type="checkbox" checked={complete} />
        {text as 'safe'}
      </label>
      <button type="button" data-ref="remove-todo" aria-label={`Remove todo: ${id}`} class="todo__item-remove">
        <svg
          width="20"
          height="20"
          aria-hidden="true"
          focusable="false"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
          class="pointer-events-none"
        >
          <path d="M18 6 6 18" />
          <path d="m6 6 12 12" />
        </svg>
      </button>
    </lite-todo-item>
  );
};

export const TodoList = ({ todos }: { todos: Todo[] }) => {
  return (
    <>
      {todos.map((todo) => (
        <TodoItem {...todo} />
      ))}
    </>
  );
};
