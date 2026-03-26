import http from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..');
const webRoot = path.join(repoRoot, 'src', 'web');
const host = process.env.HOST || '127.0.0.1';
const port = Number.parseInt(process.env.PORT || '4173', 10);

const mimeTypes = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml; charset=utf-8',
};

function resolveRequestPath(urlPathname) {
  if (urlPathname === '/' || urlPathname === '') {
    return path.join(webRoot, 'index.html');
  }

  const normalizedPath = path.normalize(decodeURIComponent(urlPathname)).replace(/^(\.\.[/\\])+/, '');
  return path.join(webRoot, normalizedPath);
}

const server = http.createServer(async (req, res) => {
  if (!req.url) {
    res.writeHead(400);
    res.end('Missing URL');
    return;
  }

  try {
    const requestUrl = new URL(req.url, `http://${host}:${port}`);
    const filePath = resolveRequestPath(requestUrl.pathname);
    const fileContent = await readFile(filePath);
    const extension = path.extname(filePath);

    res.writeHead(200, {
      'Content-Type': mimeTypes[extension] || 'application/octet-stream',
      'Cache-Control': 'no-store',
    });
    res.end(fileContent);
  } catch (error) {
    res.writeHead(404, {
      'Content-Type': 'text/plain; charset=utf-8',
    });
    res.end('Not found');
  }
});

server.listen(port, host, () => {
  console.log(`Web E2E server listening at http://${host}:${port}`);
});

