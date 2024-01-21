export async function cleanImportCache(regex: RegExp = /.(kita|css|script)/) {
  Object.keys(require.cache)
    .filter((id) => !id.includes("/node_modules/"))
    .forEach(function (id) {
      if (regex.test(id)) {
        delete require.cache[id];
      }
    });
}
