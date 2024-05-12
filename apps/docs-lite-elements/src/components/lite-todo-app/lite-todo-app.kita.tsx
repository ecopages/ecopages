import { DepsManager, type EcoComponent } from '@eco-pages/core';
import type { LiteTodoAppProps } from './lite-todo-app.script';

export const LiteTodoApp: EcoComponent<LiteTodoAppProps> = () => {
  return (
    <lite-todo-app class="lite-todo-app" count={0}>
      <div data-todo-list>
        <p>Please add your todos</p>
      </div>
      <form id="todo-form" data-todo-form>
        <div class="form-group">
          <label for="new-todo">Add Todo</label>
          <textarea form="todo-form" id="new-todo" rows="6" name="todo" />
          <button type="submit">Add</button>
        </div>
      </form>
      <p class="lite-todo-app__count">
        Number of todos: <span data-count>0</span>
      </p>
    </lite-todo-app>
  );
};

LiteTodoApp.dependencies = DepsManager.importPaths({
  importMeta: import.meta,
  scripts: ['./lite-todo-app.script.ts'],
  stylesheets: ['./lite-todo-app.css'],
});
