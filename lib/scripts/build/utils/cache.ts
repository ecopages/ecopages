export async function cleanImportCache(regex: RegExp = /.(kita|css|script)/) {
  Object.keys(require.cache)
    .filter((id) => !id.includes("/node_modules/"))
    .forEach(function (id) {
      if (regex.test(id)) {
        delete require.cache[id];
      }
    });
}

// https://ar.al/2021/02/22/cache-busting-in-node.js-dynamic-esm-imports/
export async function importFresh(modulePath: string) {
  const cacheBustingModulePath = `${modulePath.replace(
    "@",
    "/Users/andreazanenghi/eco-pages/src/"
  )}?update=${Date.now()}`;
  return await import(cacheBustingModulePath);
}
