import { DepsManager, type EcoComponent } from '@eco-pages/core';
import { stringifiedAttribute } from '@eco-pages/lite-elements/src/tools/stringified-attribute';
import type { TodoContext } from './lite-todo-app.script';
import { NoCompletedTodosMessage, NoTodosMessage, TodoList } from './lite-todo.templates';

type LiteTodoAppTemplateProps = {
  todos: TodoContext['todos'];
};

const getData = async (): Promise<LiteTodoAppTemplateProps> => {
  const now = Date.now();
  return {
    todos: [
      { id: now.toString(), text: 'Create a todo app', complete: true },
      { id: (now + 1).toString(), text: 'Add a todo item', complete: false },
      { id: (now + 2).toString(), text: 'Complete a todo item', complete: false },
    ],
  };
};

export const LiteTodoApp: EcoComponent = async () => {
  const data = await getData();
  const incompleteTodos = data.todos.filter((todo) => !todo.complete);
  const completedTodos = data.todos.filter((todo) => todo.complete);
  return (
    <lite-todo-app class="todo" hydrate-context={stringifiedAttribute<Partial<TodoContext>>({ todos: data.todos })}>
      <div class="todo__board">
        <div class="todo__panel">
          <h4>Todo List</h4>
          <p class="todo__count">
            Still to do: <span data-count>{incompleteTodos.length}</span>
          </p>
          <div class="todo__list todo__list--incomplete" data-todo-list>
            {completedTodos.length > 0 ? <TodoList todos={incompleteTodos} /> : <NoTodosMessage />}
          </div>
        </div>
        <div class="todo__panel">
          <h4>Completed Todos</h4>
          <p class="todo__count">
            Completed: <span data-count-complete>{completedTodos.length}</span>
          </p>
          <div class="todo__list todo__list--complete" data-todo-list-complete>
            {incompleteTodos.length > 0 ? <TodoList todos={completedTodos} /> : <NoCompletedTodosMessage />}
          </div>
        </div>
      </div>
      <form>
        <div class="form-group">
          <label for="new-todo">Add Todo</label>
          <input id="new-todo" name="todo" />
        </div>
        <button type="submit">Add</button>
      </form>
    </lite-todo-app>
  );
};

LiteTodoApp.dependencies = DepsManager.importPaths({
  importMeta: import.meta,
  scripts: ['./lite-todo-app.script.ts'],
  stylesheets: ['./lite-todo-app.css'],
});
