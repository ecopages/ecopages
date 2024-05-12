/**
 * @description Stringifies the attribute value keeping the type.
 * This is useful for passing objects as attributes in JSX.
 * @example <lite-todo-app class="lite-todo" initialdata={stringifiedAttribute(data.todos)}>
 */
export function stringifiedAttribute<T>(value: T): T {
  return JSON.stringify(value) as unknown as T;
}
