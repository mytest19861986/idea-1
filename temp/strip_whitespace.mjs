import fs from "node:fs";

for (const p of ["g:/project/IDEA/src/collection/trustmrr-collector.mjs", "g:/project/IDEA/test/trustmrr-collector.test.mjs"]) {
  let content = fs.readFileSync(p, "utf-8");
  content = content.replace(/[ \t]+$/gm, "");
  fs.writeFileSync(p, content, "utf-8");
}
console.log("Stripped trailing whitespace cleanly");
