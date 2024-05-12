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
        <input type="checkbox" checked={complete} />
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
