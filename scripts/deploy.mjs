// Copies the built plugin into Millennium's plugins folder.
// Leaves cache.json and settings.json in the installed plugin alone.
//
//   npm run build && npm run deploy:dry   # show what would change
//   npm run build && npm run deploy       # copy
// (Use deploy:dry rather than `deploy -- --dry-run`: PowerShell's npm.ps1 drops the `--`.)
//
// Steam path: STEAM_PATH env var, else the default install location.
// Frontend changes show after F5 in Steam; backend (Lua) changes need a Steam restart.
import { cp, mkdir, rm, stat } from 'node:fs/promises';
import { join } from 'node:path';

const dryRun = process.argv.includes('--dry-run');
const steamPath = process.env.STEAM_PATH ?? 'C:\\Program Files (x86)\\Steam';
const target = join(steamPath, 'millennium', 'plugins', 'steam-library-scores');

// [source, destination relative to target, replace whole directory]
const ITEMS = [
  ['plugin.json', 'plugin.json', false],
  ['backend', 'backend', true],
  [join('.millennium', 'Dist'), join('.millennium', 'Dist'), true],
];

async function exists(path) {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

if (!(await exists(join('.millennium', 'Dist', 'index.js')))) {
  console.error('No build output in .millennium/Dist. Run `npm run build` first.');
  process.exit(1);
}
if (!(await exists(join(steamPath, 'millennium', 'plugins')))) {
  console.error(`Millennium plugins folder not found under ${steamPath}. Set STEAM_PATH.`);
  process.exit(1);
}

console.log(`${dryRun ? '[dry run] ' : ''}Deploying to ${target}`);
for (const [source, dest, replaceDir] of ITEMS) {
  const destPath = join(target, dest);
  if (replaceDir && (await exists(destPath))) {
    console.log(`  replace ${dest}/`);
    if (!dryRun) await rm(destPath, { recursive: true });
  } else {
    console.log(`  copy    ${dest}`);
  }
  if (!dryRun) {
    await mkdir(join(destPath, '..'), { recursive: true });
    await cp(source, destPath, { recursive: true });
  }
}
console.log(dryRun ? 'Dry run only, nothing copied.' : 'Done.');
