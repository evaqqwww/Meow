import { createHash } from 'node:crypto';
import { copyFile, lstat, mkdir, readFile, readdir, realpath, rmdir, unlink, writeFile } from 'node:fs/promises';
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

function portablePath(relative) {
  return relative.split(path.sep).join('/');
}

async function contentRevision(files) {
  const hash = createHash('sha256');
  for (const relative of files) {
    const content = await readFile(path.join(sourceRoot, relative));
    hash.update(portablePath(relative)).update('\0').update(`${content.length}\0`).update(content);
  }
  return hash.digest('hex').slice(0, 16);
}

function versionUrl(url, revision) {
  const hashIndex = url.indexOf('#');
  const fragment = hashIndex === -1 ? '' : url.slice(hashIndex);
  const resource = hashIndex === -1 ? url : url.slice(0, hashIndex);
  const queryIndex = resource.indexOf('?');
  const pathname = queryIndex === -1 ? resource : resource.slice(0, queryIndex);
  const query = new URLSearchParams(queryIndex === -1 ? '' : resource.slice(queryIndex + 1));
  query.set('v', revision);
  return `${pathname}?${query}${fragment}`;
}

function versionHtml(source, revision) {
  return source.replace(/<(?:script|link)\b[^>]*>/gi, (tag) => tag.replace(
    /(\s(?:src|href)\s*=\s*)(["'])(\.{1,2}\/[^"'?#]+\.(?:js|css)(?:[?#][^"']*)?)\2/gi,
    (_, prefix, quote, url) => `${prefix}${quote}${versionUrl(url, revision)}${quote}`,
  ));
}

function versionImports(source, revision) {
  return source.replace(
    /^(\s*(?:import|export)\s+(?:[^;'"`]*?\bfrom\s*)?)(["'])(\.{1,2}\/[^"'?#\r\n]+\.js(?:[?#][^"'\r\n]*)?)\2/gm,
    (_, prefix, quote, url) => `${prefix}${quote}${versionUrl(url, revision)}${quote}`,
  );
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
  const files = (await collectFiles(sourceRoot)).sort((left, right) => {
    const a = portablePath(left);
    const b = portablePath(right);
    return a < b ? -1 : a > b ? 1 : 0;
  });
  if (!files.includes('index.html')) {
    throw new Error('The site source must contain index.html.');
  }
  const revision = await contentRevision(files);

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
    const source = path.join(sourceRoot, relative);
    if (relative === 'index.html') {
      await writeFile(destination, versionHtml(await readFile(source, 'utf8'), revision));
    } else if (path.extname(relative) === '.js') {
      await writeFile(destination, versionImports(await readFile(source, 'utf8'), revision));
    } else {
      await copyFile(source, destination);
    }
  }
  console.log(`Built ${files.length} static files in dist/.`);
} catch (error) {
  console.error(`Build failed: ${error.message}`);
  process.exitCode = 1;
}
