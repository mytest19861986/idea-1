import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";

async function files(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  return (await Promise.all(entries.map((entry) => entry.isDirectory()
    ? files(join(directory, entry.name))
    : entry.name.endsWith(".mjs") ? [join(directory, entry.name)] : []))).flat();
}

const targetFiles = await files("src");
for (const file of targetFiles) {
  const content = await readFile(file, "utf8");
  if (/[ \t]+$/m.test(content)) throw new Error(`${file}: trailing whitespace`);
}
console.log(`lint passed (${targetFiles.length} source files)`);
