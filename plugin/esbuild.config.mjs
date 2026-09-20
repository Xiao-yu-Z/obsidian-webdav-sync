import esbuild from "esbuild";
import process from "process";
import builtins from "builtin-modules";

const banner = `/* Obsidian WebDAV Sync - bundled with esbuild */`;

// 第二个参数为 production 时关闭 sourcemap
const prod = process.argv[2] === "production";

esbuild
  .build({
    banner: { js: banner },
    entryPoints: ["main.ts"],
    bundle: true,
    // obsidian / electron 等由宿主环境提供，标记为 external
    external: [
      "obsidian",
      "electron",
      "@codemirror/state",
      "@codemirror/view",
      "@codemirror/autocomplete",
      "@codemirror/collab",
      "@codemirror/commands",
      "@codemirror/language",
      "@codemirror/lint",
      "@codemirror/search",
      "@codemirror/stream-parser",
      ...builtins,
    ],
    format: "cjs",
    target: "es2020",
    logLevel: "info",
    sourcemap: prod ? false : "inline",
    treeShaking: true,
    outfile: "main.js",
  })
  .catch(() => process.exit(1));
