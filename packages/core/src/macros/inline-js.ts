import fs from "fs";

export function inlineJs(fileName: string) {
  const asString = fs.readFileSync(fileName, "utf8").trim();
  console.log(asString);
  return asString;
}
