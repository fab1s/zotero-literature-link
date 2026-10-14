import { copyFile } from "node:fs/promises";

await copyFile(new URL("../src/main.js", import.meta.url), new URL("../main.js", import.meta.url));
console.log("Built main.js from src/main.js");
