import { spawnSync } from 'node:child_process';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..');
const functionDeployRoot = path.join(repoRoot, 'function-deploy');
const functionDeployDist = path.join(functionDeployRoot, 'dist');
const hostSource = path.join(repoRoot, 'src', 'functions', 'host.json');
const hostTarget = path.join(functionDeployRoot, 'host.json');
const tscPath = path.join(repoRoot, 'node_modules', 'typescript', 'bin', 'tsc');

const aliasRoots = {
  '@core/': 'core/',
  '@services/': 'services/',
  '@infrastructure/': 'infrastructure/',
  '@functions/': 'functions/',
  '@adapters/': 'adapters/',
};

async function main() {
  await fs.mkdir(functionDeployRoot, { recursive: true });
  await fs.rm(functionDeployDist, { recursive: true, force: true });
  await fs.copyFile(hostSource, hostTarget);

  runTsc();
  await rewriteAliasSpecifiers(functionDeployDist);
}

function runTsc() {
  const result = spawnSync(process.execPath, [tscPath, '-p', 'tsconfig.functions.json'], {
    cwd: repoRoot,
    stdio: 'inherit',
  });

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

async function rewriteAliasSpecifiers(rootDir) {
  const entries = await fs.readdir(rootDir, { withFileTypes: true });

  await Promise.all(
    entries.map(async (entry) => {
      const fullPath = path.join(rootDir, entry.name);
      if (entry.isDirectory()) {
        await rewriteAliasSpecifiers(fullPath);
        return;
      }

      if (!entry.isFile() || !fullPath.endsWith('.js')) {
        return;
      }

      const original = await fs.readFile(fullPath, 'utf8');
      const rewritten = original.replace(
        /require\((['"])(@(?:core|services|infrastructure|functions|adapters)\/[^'"]+)\1\)/g,
        (_match, quote, specifier) => {
          const resolved = resolveAliasSpecifier(fullPath, specifier);
          return `require(${quote}${resolved}${quote})`;
        }
      );

      if (rewritten !== original) {
        await fs.writeFile(fullPath, rewritten, 'utf8');
      }
    })
  );
}

function resolveAliasSpecifier(sourceFile, specifier) {
  for (const [prefix, targetRoot] of Object.entries(aliasRoots)) {
    if (!specifier.startsWith(prefix)) {
      continue;
    }

    const relativeTarget = specifier.slice(prefix.length);
    const absoluteTarget = path.join(functionDeployDist, targetRoot, relativeTarget);
    let resolved = path.relative(path.dirname(sourceFile), absoluteTarget).replace(/\\/g, '/');

    if (!resolved.startsWith('.')) {
      resolved = `./${resolved}`;
    }

    return `${resolved}.js`;
  }

  throw new Error(`Unsupported alias specifier: ${specifier}`);
}

main().catch((error) => {
  console.error('Failed to build function deployment package:', error);
  process.exit(1);
});
