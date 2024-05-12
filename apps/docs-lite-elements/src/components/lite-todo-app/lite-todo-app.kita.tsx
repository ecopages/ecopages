import { DepsManager, type EcoComponent } from '@eco-pages/core';
import { stringifiedAttribute } from '@eco-pages/lite-elements/src/tools/stringified-attribute';
import type { TodoContext } from './lite-todo-app.script';
import { NoCompletedTodosMessage, NoTodosMessage, TodoList } from './lite-todo.templates';

type LiteTodoAppTemplateProps = {
  title: string;
  description: string;
  todos: TodoContext['todos'];
};

const getData = async (): Promise<LiteTodoAppTemplateProps> => {
  return {
    title: 'Lite Todo App',
    description: 'A simple todo app, built with lite elements using WithKita mixin and context.',
    todos: [
      { id: '1', text: 'Create a todo app', complete: true },
      { id: '2', text: 'Add a todo item', complete: false },
      { id: '3', text: 'Complete a todo item', complete: false },
    ],
  };
};

export const LiteTodoApp: EcoComponent = async () => {
  const data = await getData();
  const incompleteTodos = data.todos.filter((todo) => !todo.complete);
  const completedTodos = data.todos.filter((todo) => todo.complete);
  return (
    <>
      <h3 safe>{data.title}</h3>
      <p safe>{data.description}</p>
      <lite-todo-app class="todo" initialdata={stringifiedAttribute(data.todos)}>
        <div class="todo__board">
          <div class="todo__panel">
            <h4>Todo List</h4>
            <div class="todo__list todo__list--incomplete" data-todo-list>
              {completedTodos.length > 0 ? <TodoList todos={incompleteTodos} /> : <NoTodosMessage />}
            </div>
          </div>
          <div class="todo__panel">
            <h4>Completed Todos</h4>
            <div class="todo__list todo__list--complete" data-todo-list-complete>
              {incompleteTodos.length > 0 ? <TodoList todos={completedTodos} /> : <NoCompletedTodosMessage />}
            </div>
          </div>
        </div>
        <form id="todo-form" data-todo-form>
          <div class="todo__todo-form-group">
            <label for="new-todo">Add Todo</label>
            <textarea form="todo-form" id="new-todo" rows="6" name="todo" />
            <button type="submit">Add</button>
          </div>
        </form>
        <div class="todo__count">
          <p>
            Still to do: <span data-count>{incompleteTodos.length}</span>
          </p>
          <p>
            Completed: <span data-count-complete>{completedTodos.length}</span>
          </p>
        </div>
      </lite-todo-app>
    </>
  );
};

LiteTodoApp.dependencies = DepsManager.importPaths({
  importMeta: import.meta,
  scripts: ['./lite-todo-app.script.ts'],
  stylesheets: ['./lite-todo-app.css'],
});
