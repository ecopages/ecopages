const isProduction: boolean = process.env.NODE_ENV === 'production';
const prefix: string = '[eco-pages]';

export default function invariant(condition: any, message?: string | (() => string)): asserts condition {
  if (condition) {
    return;
  }
  if (isProduction) throw new Error(prefix);

  const provided: string | undefined = typeof message === 'function' ? message() : message;

  const value: string = provided ? `${prefix} ${provided}` : `${prefix} An error occurred`;
  throw new Error(value);
}
