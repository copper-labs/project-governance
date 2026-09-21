import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { execFileSync } from 'node:child_process';

/** Bind a deliberate major release to its archive bytes; never opt existing users into migration. */
export function releaseAssets({ manifest, tag, sourceCommit, repository, archiveName, bytes }) {
  if (!/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(tag) || Number(tag.split('.')[0]) < 3 ||
      manifest.name !== '@organta/project-governance' || manifest.version !== tag ||
      manifest.engines?.node !== '>=24.16.0 <25') throw new Error('Release tag and compiled package identity must agree');
  if (!/^[a-f0-9]{40}(?:[a-f0-9]{24})?$/.test(sourceCommit) ||
      !/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repository) ||
      archiveName !== `organta-project-governance-${tag}.tgz`) throw new Error('Invalid release source or destination');
  const lock = { schema_version: 2, package: manifest.name, version: tag,
    artifact: { url: `https://github.com/${repository}/releases/download/${tag}/${archiveName}`,
      integrity: `sha512-${createHash('sha512').update(bytes).digest('base64')}` },
    source_commit: sourceCommit, node: manifest.engines.node, configuration_schema: 1 };
  const lockText = JSON.stringify(lock, null, 2) + '\n';
  const metadata = { schema_version: 1, version: tag,
    lock_sha256: createHash('sha256').update(lockText).digest('hex'), startup_contract: 2,
    automatic: false, from_version: `${tag.split('.')[0]}.0.0`,
    before_version: `${Number(tag.split('.')[0]) + 1}.0.0`, configuration_schema: 1, integration_change: true };
  return { lockText, metadata };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const [archive, tag, repository, output] = process.argv.slice(2);
  if (!archive || !tag || !repository || !output) throw new Error('Expected archive, tag, repository, output directory');
  const manifest = JSON.parse(execFileSync('tar', ['-xOzf', archive, 'package/package.json'], { encoding: 'utf8', maxBuffer: 1024 * 1024 }));
  const sourceCommit = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
  const assets = releaseAssets({ manifest, tag, repository, sourceCommit, archiveName: basename(archive), bytes: readFileSync(archive) });
  writeFileSync(join(output, 'runtime.lock.yaml'), assets.lockText, { flag: 'wx' });
  writeFileSync(join(output, 'runtime-update.json'), JSON.stringify(assets.metadata, null, 2) + '\n', { flag: 'wx' });
}
