     1|import { readFileSync } from "node:fs";
     2|import { execSync } from "node:child_process";
     3|
     4|try {
     5|  const config = readFileSync("wrangler.jsonc", "utf8");
     6|  if (!config.includes('"DB"')) process.exit(0);
     7|} catch {
     8|  process.exit(0);
     9|}
    10|
    11|execSync("wrangler d1 migrations apply DB --local --config wrangler.jsonc", {
    12|  stdio: "inherit",
    13|});
    14|