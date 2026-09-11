import { cp, mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

const source = resolve('src', 'control-plane', 'sql');
const destination = resolve('dist', 'src', 'control-plane', 'sql');
await mkdir(dirname(destination), { recursive: true });
await cp(source, destination, { recursive: true });
