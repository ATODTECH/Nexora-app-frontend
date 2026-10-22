// One-off: saves the Figma truth screens in ./figma-truth into Nexora's Supabase Storage.
// Run from the project folder:  node tools/upload-figma-screens.mjs
// Folder layout: figma-truth/<bucket>/<file path>. Existing files with the same name are replaced.
import { readdir, readFile } from 'node:fs/promises';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(fileURLToPath(new URL('.', import.meta.url)), '..', 'figma-truth');
const ENDPOINT = 'https://evevvwlglxzeoamvcodx.supabase.co/functions/v1/nexora-asset-upload';
const TOKEN = 'd3aadb4c77ec4a2e7e7b46eda15e0b29f9b7c35731f8da84';

async function walk(dir) {
  const out = [];
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) out.push(...await walk(p)); else if (/\.(png|svg)$/i.test(e.name)) out.push(p);
  }
  return out;
}
const files = await walk(ROOT);
console.log(`Uploading ${files.length} screens to Supabase...`);
let ok = 0, failed = 0;
for (const f of files) {
  const rel = relative(ROOT, f).split(sep);
  const bucket = rel.shift(); const path = rel.join('/');
  const data = (await readFile(f)).toString('base64');
  try {
    const res = await fetch(ENDPOINT, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token: TOKEN, bucket, path, data }) });
    const j = await res.json().catch(() => ({}));
    if (res.ok && j.ok) { ok++; console.log('  saved', bucket + '/' + path); }
    else { failed++; console.log('  FAILED', bucket + '/' + path, j.error || res.status); }
  } catch (e) { failed++; console.log('  FAILED', bucket + '/' + path, e.message); }
}
console.log(`Done: ${ok} saved, ${failed} failed.`);
