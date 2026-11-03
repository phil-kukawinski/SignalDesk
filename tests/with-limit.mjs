// Runs one test command with a time limit, so a hung browser fails the suite instead of stalling it.
// usage: node tests/with-limit.mjs 120 bash tests/ui/run.sh tests/ui/ui4.js
import { spawn } from 'node:child_process';
const [seconds, command, ...args] = process.argv.slice(2);
// Its own process group, so stopping it also stops the browser it started.
const child = spawn(command, args, { stdio: 'inherit', detached: true });
const stop = (signal) => { try { process.kill(-child.pid, signal); } catch { /* already gone */ } };
let timedOut = false;
const timer = setTimeout(() => {
  timedOut = true;
  console.log(`ERR=[exception] Timed out after ${seconds} seconds`);
  stop('SIGTERM');
  setTimeout(() => stop('SIGKILL'), 3000).unref();
}, Number(seconds) * 1000);
child.on('close', (code) => { clearTimeout(timer); process.exit(timedOut ? 124 : code ?? 1); });
