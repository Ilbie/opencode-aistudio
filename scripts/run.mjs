import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");
const npmCommand = "npm";
const childEnv = normalizedChildEnv();
const useShell = process.platform === "win32";
const args = process.argv.slice(2);
const mode = args[0] && !args[0].startsWith("-") ? args[0] : "dev";
const passThroughArgs = mode === args[0] ? args.slice(1) : args;
const allowedModes = new Set(["dev", "start", "build", "preview", "lint"]);

if (!allowedModes.has(mode)) {
  console.error(`Unknown mode "${mode}". Use one of: ${Array.from(allowedModes).join(", ")}`);
  process.exit(1);
}

const majorVersion = Number.parseInt(process.versions.node.split(".")[0] ?? "0", 10);
if (majorVersion < 20) {
  console.error(`Node.js 20+ is required. Current version: ${process.version}`);
  process.exit(1);
}

if (!existsSync(resolve(root, "node_modules"))) {
  console.log("Dependencies are missing. Running npm install...");
  const install = spawn(npmCommand, ["install"], {
    cwd: root,
    env: childEnv,
    stdio: "inherit",
    shell: useShell,
  });
  const installCode = await exitCodeFor(install);
  if (installCode !== 0) {
    process.exit(installCode);
  }
}

const child = spawn(npmCommand, ["run", mode, "--", ...passThroughArgs], {
  cwd: root,
  env: childEnv,
  stdio: "inherit",
  shell: useShell,
});

process.exit(await exitCodeFor(child));

function exitCodeFor(child) {
  return new Promise((resolveCode) => {
    child.once("exit", (code, signal) => {
      if (signal) {
        console.error(`Process exited with signal ${signal}`);
        resolveCode(1);
        return;
      }

      resolveCode(code ?? 0);
    });
  });
}

function normalizedChildEnv() {
  if (process.platform !== "win32") {
    return process.env;
  }

  const env = { ...process.env };
  const pathKey = Object.keys(env).find((key) => key.toLowerCase() === "path");
  const pathValue = pathKey ? env[pathKey] : undefined;

  for (const key of Object.keys(env)) {
    if (key.toLowerCase() === "path" && key !== "Path") {
      delete env[key];
    }
  }

  if (pathValue) {
    env.Path = pathValue;
  }

  return env;
}
