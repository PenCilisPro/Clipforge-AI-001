import { spawn } from "node:child_process";

const children = new Set();
let shuttingDown = false;

function start(name, args) {
  const child = spawn("npx", args, {
    cwd: process.cwd(),
    stdio: "inherit",
    shell: false,
  });

  children.add(child);

  child.on("error", (error) => {
    console.error(`[supervisor] ${name} failed to start:`, error);
  });

  child.on("exit", (code, signal) => {
    children.delete(child);

    if (shuttingDown) return;

    console.error(
      `[supervisor] ${name} exited (code=${code}, signal=${signal}); restarting in 3s...`,
    );

    setTimeout(() => {
      if (!shuttingDown) start(name, args);
    }, 3000).unref();
  });
}

console.log("ClipForge dedicated worker supervisor started.");
console.log("Starting pipeline worker + source/render worker...");

// pipeline.ts claims QUEUED projects, downloads/analyzes them, creates
// render_jobs, and waits for those jobs to finish.
start("pipeline", ["tsx", "--import", "./rapidApiFetchFallback.ts", "pipeline.ts"]);

// sourceRepair.ts repairs missing sourceVideo values and launches the
// Remotion render worker for QUEUED render jobs.
start("source-repair/render", ["tsx", "sourceRepair.ts"]);

function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`[supervisor] Received ${signal}; stopping workers...`);

  for (const child of children) {
    child.kill("SIGTERM");
  }

  setTimeout(() => process.exit(0), 5000).unref();
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));

process.on("exit", () => {
  for (const child of children) {
    try { child.kill("SIGTERM"); } catch {}
  }
});
