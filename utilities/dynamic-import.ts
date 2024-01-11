export async function dynamicImport<T>(modulePath: string) {
  delete require.cache[require.resolve(modulePath)];
  const moduleExports = await import(modulePath);
  return moduleExports as T;
}
