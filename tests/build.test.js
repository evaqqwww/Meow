import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { copyFile, lstat, mkdir, mkdtemp, readFile, realpath, rm, stat, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { promisify } from 'node:util';

const run = promisify(execFile);
const buildScript = fileURLToPath(new URL('../scripts/build.mjs', import.meta.url));

async function fixture(t) {
  const temporaryRoot = await realpath(os.tmpdir());
  const root = await mkdtemp(path.join(temporaryRoot, 'meow-build-test-'));
  t.after(async () => {
    // Check the exact absolute target immediately before recursive removal.
    const target = path.resolve(root);
    assert.equal(path.isAbsolute(target), true);
    assert.equal(path.dirname(target), temporaryRoot);
    assert.match(path.basename(target), /^meow-build-test-[A-Za-z0-9]+$/);
    assert.equal((await lstat(target)).isSymbolicLink(), false);
    assert.equal(await realpath(target), target);
    await rm(target, { recursive: true, force: true });
  });

  await mkdir(path.join(root, 'scripts'));
  await mkdir(path.join(root, 'site', 'assets'), { recursive: true });
  await copyFile(buildScript, path.join(root, 'scripts', 'build.mjs'));
  await writeFile(path.join(root, 'package.json'), '{"type":"module"}');
  const sources = new Map([
    ['index.html', '<!doctype html>\n<link rel="stylesheet" href="./styles.css?theme=light#colors">\n<script type="module" src="./app.js"></script>\n<link rel="preload" as="image" href="./assets/cat.png">\n<script src="https://example.invalid/external.js"></script>\n'],
    ['app.js', "import { step } from './interaction.js';\nexport const value = step;\n"],
    ['interaction.js', 'import { blessing } from "./blessings.js";\nexport const step = blessing;\n'],
    ['blessings.js', "export const blessing = '愿你平安';\n"],
    ['styles.css', 'body { color: #333; }\n'],
    ['assets/cat.png', Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=', 'base64')],
  ]);
  for (const [relative, content] of sources) {
    await writeFile(path.join(root, 'site', relative), content);
  }

  return {
    root,
    sources,
    build: () => run(process.execPath, [path.join(root, 'scripts', 'build.mjs')], { cwd: root }),
    output: (relative) => readFile(path.join(root, 'dist', relative), 'utf8'),
  };
}

function capture(source, pattern) {
  const match = source.match(pattern);
  assert.ok(match, `Expected an output reference matching ${pattern}`);
  return match[1];
}

function revisionFrom(html) {
  const url = new URL(capture(html, /src="(\.\/app\.js[^"\r\n]*)"/), 'https://example.invalid/Meow/');
  const revision = url.searchParams.get('v');
  assert.match(revision, /^[a-f0-9]{12,64}$/);
  return revision;
}

test('versions HTML resources and the complete module chain with one resolvable revision', async (t) => {
  const project = await fixture(t);
  await project.build();
  const html = await project.output('index.html');
  const app = await project.output('app.js');
  const interaction = await project.output('interaction.js');
  const revision = revisionFrom(html);
  const references = [
    ['index.html', capture(html, /src="(\.\/app\.js[^"\r\n]*)"/), 'app.js'],
    ['index.html', capture(html, /href="(\.\/styles\.css[^"\r\n]*)"/), 'styles.css'],
    ['app.js', capture(app, /from\s*'([^']+)'/), 'interaction.js'],
    ['interaction.js', capture(interaction, /from\s*"([^"]+)"/), 'blessings.js'],
  ];
  for (const [importer, reference, expectedFile] of references) {
    const url = new URL(reference, pathToFileURL(path.join(project.root, 'dist', importer)));
    assert.equal(url.searchParams.get('v'), revision);
    assert.equal(fileURLToPath(url), path.join(project.root, 'dist', expectedFile));
    assert.equal((await stat(fileURLToPath(url))).isFile(), true);
  }
  const cssUrl = new URL(references[1][1], 'https://example.invalid/Meow/');
  assert.equal(cssUrl.searchParams.get('theme'), 'light');
  assert.equal(cssUrl.hash, '#colors');
  assert.ok(html.includes('src="https://example.invalid/external.js"'));
  const loaded = await import(pathToFileURL(path.join(project.root, 'dist', 'app.js')).href);
  assert.equal(loaded.value, '愿你平安');
});

test('keeps identical builds stable and changes the revision when any module changes', async (t) => {
  const project = await fixture(t);
  await project.build();
  const firstHtml = await project.output('index.html');
  const firstApp = await project.output('app.js');
  let previousRevision = revisionFrom(firstHtml);
  await project.build();
  assert.equal(await project.output('index.html'), firstHtml);
  assert.equal(await project.output('app.js'), firstApp);

  for (const module of ['app.js', 'interaction.js', 'blessings.js']) {
    await writeFile(path.join(project.root, 'site', module), `${project.sources.get(module)}\n// changed source\n`);
    await project.build();
    const nextRevision = revisionFrom(await project.output('index.html'));
    assert.notEqual(nextRevision, previousRevision, `${module} must invalidate the resource graph`);
    assert.ok((await project.output('app.js')).includes(`?v=${nextRevision}`));
    assert.ok((await project.output('interaction.js')).includes(`?v=${nextRevision}`));
    previousRevision = nextRevision;
  }
});

test('leaves source files untouched and copies PNG bytes without transformation', async (t) => {
  const project = await fixture(t);
  await project.build();
  for (const [relative, original] of project.sources) {
    const current = await readFile(path.join(project.root, 'site', relative));
    assert.deepEqual(current, Buffer.isBuffer(original) ? original : Buffer.from(original));
  }
  assert.deepEqual(await readFile(path.join(project.root, 'dist', 'assets', 'cat.png')), project.sources.get('assets/cat.png'));
  assert.ok((await project.output('index.html')).includes('href="./assets/cat.png"'));
});
