import { readFile, writeFile } from "node:fs/promises";

const file = new URL("../dist/server/wrangler.json", import.meta.url);
const config = JSON.parse(await readFile(file, "utf8"));

if ("legacy_env" in config) {
  delete config.legacy_env;
  await writeFile(file, `${JSON.stringify(config)}\n`);
}
