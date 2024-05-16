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
      {text as 'safe'}
      <span>
        <label class="sr-only" for={`todo-${id}`}>
          Set complete todo: {id as 'safe'}
        </label>
        <input id={`todo-${id}`} name={id} type="checkbox" checked={complete} />
      </span>
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
