import { spawn } from "node:child_process";
import path from "node:path";

const root = process.cwd();
const nextCli = path.join(root, "node_modules", "next", "dist", "bin", "next");
const playwrightCli = path.join(root, "node_modules", "@playwright", "test", "cli.js");
const port = process.env.E2E_PORT ?? "3000";
const baseURL = `http://127.0.0.1:${port}`;

const server = spawn(
  process.execPath,
  [nextCli, "start", "--hostname", "127.0.0.1", "--port", port],
  {
    cwd: root,
    stdio: "inherit",
    windowsHide: true,
  },
);

async function waitUntilReady() {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    try {
      const response = await fetch(baseURL);
      if (response.ok) return;
    } catch {
      // 服务尚未监听，继续等待。
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error("本地生产服务器未在 30 秒内启动。");
}

function stopServer() {
  if (!server.pid || server.exitCode !== null) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(
      () => reject(new Error("本地生产服务器未在 5 秒内退出。")),
      5_000,
    );
    server.once("exit", () => {
      clearTimeout(timeout);
      resolve();
    });
    if (!server.kill()) {
      clearTimeout(timeout);
      reject(new Error("无法停止本地生产服务器。"));
    }
  });
}

let exitCode = 1;
try {
  await Promise.race([
    waitUntilReady(),
    new Promise((_, reject) => server.once("error", reject)),
    new Promise((_, reject) =>
      server.once("exit", (code) =>
        reject(new Error(`本地生产服务器提前退出（代码 ${code ?? "未知"}）。`)),
      ),
    ),
  ]);
  const tests = spawn(
    process.execPath,
    [playwrightCli, "test", ...process.argv.slice(2)],
    {
      cwd: root,
      env: { ...process.env, E2E_BASE_URL: baseURL },
      stdio: "inherit",
      windowsHide: true,
    },
  );
  exitCode = await new Promise((resolve, reject) => {
    tests.once("error", reject);
    tests.once("exit", resolve);
  });
} finally {
  await stopServer();
}

process.exitCode = typeof exitCode === "number" ? exitCode : 1;
