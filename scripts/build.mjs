import { copyFile, lstat, mkdir, readdir, realpath, rmdir, unlink } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = await realpath(fileURLToPath(new URL('../', import.meta.url)));
const sourceRoot = path.join(projectRoot, 'site');
const outputRoot = path.join(projectRoot, 'dist');

function assertInside(root, target) {
  const relative = path.relative(root, target);
  if (relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
    throw new Error('Build path must stay inside its intended directory.');
  }
}

async function collectFiles(directory, relative = '') {
  const files = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const source = path.join(directory, entry.name);
    const destination = path.join(relative, entry.name);
    assertInside(sourceRoot, source);
    if (entry.isSymbolicLink()) {
      throw new Error('The site directory must not contain symbolic links.');
    }
    if (entry.isDirectory()) {
      files.push(...await collectFiles(source, destination));
    } else if (entry.isFile()) {
      files.push(destination);
    } else {
      throw new Error('The site directory may only contain regular files and directories.');
    }
  }
  return files;
}

// Clear only the fixed, verified dist directory, without following links or using
// a recursive-delete operation. Source validation happens before any cleanup.
async function clearOutput(directory) {
  assertInside(outputRoot, directory);
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const target = path.join(directory, entry.name);
    assertInside(outputRoot, target);
    const info = await lstat(target);
    if (info.isDirectory() && !info.isSymbolicLink()) {
      await clearOutput(target);
      await rmdir(target);
    } else {
      await unlink(target);
    }
  }
}

try {
  const sourceInfo = await lstat(sourceRoot);
  if (!sourceInfo.isDirectory() || sourceInfo.isSymbolicLink()) {
    throw new Error('The site source must be a regular directory.');
  }
  const files = await collectFiles(sourceRoot);
  if (!files.includes('index.html')) {
    throw new Error('The site source must contain index.html.');
  }

  if (path.dirname(outputRoot) !== projectRoot || path.basename(outputRoot) !== 'dist') {
    throw new Error('Unexpected build output directory.');
  }
  await mkdir(outputRoot, { recursive: true });
  const outputInfo = await lstat(outputRoot);
  if (!outputInfo.isDirectory() || outputInfo.isSymbolicLink()) {
    throw new Error('The build output must be a regular directory.');
  }
  await clearOutput(outputRoot);

  for (const relative of files) {
    const destination = path.join(outputRoot, relative);
    assertInside(outputRoot, destination);
    await mkdir(path.dirname(destination), { recursive: true });
    await copyFile(path.join(sourceRoot, relative), destination);
  }
  console.log(`Built ${files.length} static files in dist/.`);
} catch (error) {
  console.error(`Build failed: ${error.message}`);
  process.exitCode = 1;
}
