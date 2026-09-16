import { spawn } from 'node:child_process';
import { loadEnvFile } from 'node:process';

try {
  loadEnvFile('.env');
} catch {
  // .env optional; deployment environment may provide variables directly.
}

const isWindows = process.platform === 'win32';
const npmCmd = isWindows ? 'npm.cmd' : 'npm';

console.log('[dev-runner] Starting WebLens Backend API server and Next.js Dashboard UI...');

// 1. Start Backend API / Dashboard Service
const backend = spawn(npmCmd, ['run', 'dashboard'], {
  stdio: 'inherit',
  shell: true,
  env: {
    ...process.env,
    PORT: '3001',
  },
});

// 2. Start Next.js Frontend
const frontend = spawn(npmCmd, ['run', 'dashboard:dev'], {
  stdio: 'inherit',
  shell: true,
  env: {
    ...process.env,
    PORT: '3000',
  },
});

function cleanup() {
  console.log('\n[dev-runner] Shutting down processes...');
  backend.kill('SIGTERM');
  frontend.kill('SIGTERM');
  process.exit(0);
}

process.on('SIGINT', cleanup);
process.on('SIGTERM', cleanup);
