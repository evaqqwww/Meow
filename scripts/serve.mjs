import { createServer } from 'node:http';
import { lstat, open, realpath } from 'node:fs/promises';
import path from 'node:path';
import { pipeline } from 'node:stream/promises';
import { fileURLToPath } from 'node:url';

const projectRoot = fileURLToPath(new URL('../', import.meta.url));
const mimeTypes = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.png': 'image/png',
  '.mp3': 'audio/mpeg',
};

function optionsFrom(args) {
  let directory = 'site';
  let directorySet = false;
  let port = 4173;
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === '--port' || argument.startsWith('--port=')) {
      const value = argument === '--port' ? args[++index] : argument.slice(7);
      if (!value || !/^\d+$/.test(value) || Number(value) < 1 || Number(value) > 65535) {
        throw new Error('--port must be an integer from 1 to 65535.');
      }
      port = Number(value);
    } else if (!directorySet && (argument === 'site' || argument === 'dist')) {
      directory = argument;
      directorySet = true;
    } else {
      throw new Error('Usage: node scripts/serve.mjs [site|dist] [--port 4173]');
    }
  }
  return { directory, port };
}

function isInside(root, target) {
  const relative = path.relative(root, target);
  return relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative);
}

function respond(response, status, message) {
  response.writeHead(status, { 'Content-Type': 'text/plain; charset=utf-8' });
  response.end(message);
}

try {
  const { directory, port } = optionsFrom(process.argv.slice(2));
  const requestedRoot = path.join(projectRoot, directory);
  const rootInfo = await lstat(requestedRoot);
  if (!rootInfo.isDirectory() || rootInfo.isSymbolicLink()) {
    throw new Error('The preview root must be a regular directory.');
  }
  const root = await realpath(requestedRoot);

  const server = createServer(async (request, response) => {
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.setHeader('Referrer-Policy', 'no-referrer');
    response.setHeader('Cache-Control', 'no-store');
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      response.setHeader('Allow', 'GET, HEAD');
      respond(response, 405, 'Method not allowed.');
      return;
    }

    let pathname;
    try {
      const rawPath = (request.url ?? '').split(/[?#]/, 1)[0];
      if (!rawPath.startsWith('/') || rawPath.startsWith('//')) {
        throw new Error('Invalid request path.');
      }
      pathname = decodeURIComponent(rawPath);
    } catch {
      respond(response, 400, 'Bad request.');
      return;
    }

    const segments = pathname.split('/');
    if (/[\\\0:*?"<>|]/.test(pathname) || segments.some((part) => part === '..' || part.startsWith('.'))) {
      respond(response, 403, 'Forbidden.');
      return;
    }
    if (pathname === '/Meow') {
      response.writeHead(308, { Location: '/Meow/' });
      response.end();
      return;
    }
    if (pathname.startsWith('/Meow/')) pathname = pathname.slice('/Meow'.length);
    const relative = pathname === '/' ? 'index.html' : pathname.slice(1);
    const candidate = path.resolve(root, relative);
    if (!isInside(root, candidate)) {
      respond(response, 403, 'Forbidden.');
      return;
    }

    let handle;
    try {
      const filename = await realpath(candidate);
      if (!isInside(root, filename)) {
        respond(response, 403, 'Forbidden.');
        return;
      }
      handle = await open(filename, 'r');
      const info = await handle.stat();
      if (!info.isFile()) {
        await handle.close();
        handle = undefined;
        respond(response, 404, 'Not found.');
        return;
      }
      response.writeHead(200, {
        'Content-Type': mimeTypes[path.extname(filename).toLowerCase()] ?? 'application/octet-stream',
        'Content-Length': info.size,
      });
      if (request.method === 'HEAD') {
        await handle.close();
        handle = undefined;
        response.end();
        return;
      }
      const stream = handle.createReadStream();
      handle = undefined;
      await pipeline(stream, response);
    } catch (error) {
      if (handle) await handle.close().catch(() => {});
      if (response.headersSent) {
        response.destroy();
      } else if (['ENOENT', 'ENOTDIR', 'EISDIR', 'EACCES'].includes(error.code)) {
        respond(response, 404, 'Not found.');
      } else {
        respond(response, 500, 'Server error.');
      }
    }
  });

  server.on('error', (error) => {
    console.error(error.code === 'EADDRINUSE' ? 'Preview port is already in use.' : 'Preview server could not start.');
    process.exitCode = 1;
  });
  server.listen(port, '127.0.0.1', () => {
    console.log(`Serving ${directory}/ at http://127.0.0.1:${port}/`);
    console.log(`Pages path preview: http://127.0.0.1:${port}/Meow/`);
  });
} catch (error) {
  console.error(error.code === 'ENOENT'
    ? 'Preview directory is missing. Use npm run dev for source, or npm run build before npm run preview.'
    : error.message);
  process.exitCode = 1;
}
