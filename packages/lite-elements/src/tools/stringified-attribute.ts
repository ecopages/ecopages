/**
 * @description Stringifies the attribute value keeping the type.
 * This is useful for passing objects as attributes in JSX.
 * @example <my-app class="lite-todo" hydrate-context={stringifiedAttribute<MyType>(context)}>
 */
export function stringifiedAttribute<T>(value: T): T {
  return JSON.stringify(value) as unknown as T;
}
