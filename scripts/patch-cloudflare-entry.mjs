import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const entryPath = join(process.cwd(), 'dist', 'server', 'entry.mjs');
const marker = 'const locals = createLocals(context);';
const replacement = `${marker}
	locals.env = env;`;

const source = await readFile(entryPath, 'utf8');

if (source.includes(replacement)) {
  process.exit(0);
}

if (!source.includes(marker)) {
  throw new Error('Could not find Cloudflare locals creation in dist/server/entry.mjs');
}

await writeFile(entryPath, source.replace(marker, replacement));
