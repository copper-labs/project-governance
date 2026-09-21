import { lstatSync, readdirSync, realpathSync, mkdirSync, openSync, writeFileSync, fsyncSync, closeSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import { createHash } from "node:crypto";
import { canonical, digest, durableJson, object } from "./core.ts";
import { narrativeFile } from "./narrative-inputs.ts";
import { worktreeBytes } from "./change-subject.ts";
import { legacyJobInventory } from "./legacy-job-inventory.ts";

const hash = (bytes: Buffer) => `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
type Member = {path:string; sourceDigest:string; bytes:number; mode:number};

/** Readback binds an externally retained receipt identity; it never consults or resumes old jobs. */
export function inspectLegacyHistoryArchive(directory: string, expectedReceiptDigest: string) {
  directory = realpathSync(directory);
  const raw = narrativeFile(directory,"archive.json");
  if (!/^sha256:[a-f0-9]{64}$/u.test(expectedReceiptDigest) || hash(Buffer.from(raw)) !== expectedReceiptDigest)
    throw new Error("Legacy archive receipt digest differs");
  const receipt = object(JSON.parse(raw));
  const inventory = object(receipt.inventory);
  if (typeof inventory.workspace !== "string" || !inventory.workspace) throw new Error("Archive workspace missing");
  if (receipt.version !== 1 || receipt.state !== "verified" || receipt.kind !== "legacy-history-archive" ||
      receipt.scope !== "selected-job-directory-contents" || receipt.drain !== "unverified" || receipt.externalReferences !== "not-verified" ||
      !Array.isArray(receipt.records) || !receipt.records.length || receipt.records.length > 10000)
    throw new Error("Unsupported legacy archive receipt");
  const ids = new Set<string>(), budget = {bytes:0,entries:0};
  for (const rawRecord of receipt.records) {
    const record = object(rawRecord);
    if (typeof record.id !== "string" || !/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/u.test(record.id) || ids.has(record.id) ||
        !Array.isArray(record.files) || !Array.isArray(record.directories)) throw new Error("Invalid legacy archive record");
    ids.add(record.id);
    const expectedFiles = record.files.map(rawMember=>{
      const member = object(rawMember);
      if (!Number.isSafeInteger(member.mode) || Number(member.mode)<0 || Number(member.mode)>0o777) throw new Error("Invalid historical file mode");
      return {...member,mode:0o600};
    });
    const actual = snapshot(join(directory,record.id),budget);
    if (digest(actual) !== digest({files:expectedFiles,directories:record.directories,bytes:record.bytes}))
      throw new Error("Legacy archive contents differ from receipt");
  }
  if (digest(readdirSync(directory).sort()) !== digest(["archive.json",...ids].sort())) throw new Error("Unexpected legacy archive entries");
  return {version:1,state:"verified",workspace:inventory.workspace,receiptDigest:expectedReceiptDigest,jobs:ids.size,bytes:budget.bytes,
    scope:"selected-job-directory-contents",drain:"unverified",externalReferences:"not-verified"};
}

function snapshot(root: string, budget = {bytes:0,entries:0}) {
  const files: Member[] = [], directories: string[] = [];
  let bytes = 0, entries = 0;
  const walk = (path: string, depth: number) => {
    if (++entries > 10000 || ++budget.entries > 10000 || depth > 16) throw new Error("Legacy archive entry bound exceeded");
    const stat = lstatSync(path);
    if (stat.isSymbolicLink() || realpathSync(path) !== path) throw new Error("Legacy archive source uses aliases");
    const name = relative(root,path);
    if (stat.isDirectory()) {
      if (name) directories.push(name);
      const names = readdirSync(path).sort();
      if (names.length > 10000) throw new Error("Legacy archive directory bound exceeded");
      for (const child of names) walk(join(path,child),depth+1);
    } else {
      if (!stat.isFile() || stat.mode & 0o7000) throw new Error("Unsupported legacy archive member");
      if (stat.size > 16*1024*1024 || budget.bytes + stat.size > 256*1024*1024) throw new Error("Legacy archive byte bound exceeded");
      const captured = worktreeBytes(root,name,16*1024*1024);
      if (captured.type !== "regular") throw new Error("Legacy archive source changed type");
      bytes += captured.bytes.length;
      budget.bytes += captured.bytes.length;
      if (bytes > 256*1024*1024) throw new Error("Legacy archive byte bound exceeded");
      files.push({path:name,sourceDigest:hash(captured.bytes),bytes:captured.bytes.length,mode:stat.mode & 0o777});
    }
  };
  walk(root,0);
  return {files,directories,bytes};
}

/** Preserve historical bytes without importing execution authority or altering the legacy owner. */
export function archiveLegacyHistory(workspace: string, store: string, destination: string) {
  const inventory = legacyJobInventory(workspace,store);
  if (inventory.truncated || inventory.issues.length || !inventory.jobs.length) throw new Error("Complete nonempty legacy inventory required");
  if (inventory.jobs.some(job=>!["succeeded","failed","blocked","cancelled","timed_out"].includes(job.state) || job.result?.cleanupReported !== "confirmed"))
    throw new Error("Legacy history archive requires terminal receipts reporting cleanup");
  destination = resolve(destination);
  if (destination === inventory.store || destination.startsWith(inventory.store+sep)) throw new Error("Archive must be outside legacy store");
  if (realpathSync(dirname(destination)) !== dirname(destination)) throw new Error("Archive destination uses aliases");
  const budget = {bytes:0,entries:0};
  const sources = inventory.jobs.map(job=>({job,snapshot:snapshot(job.directory,budget)}));
  for (const {job,snapshot:source} of sources)
    if (source.files.find(file=>file.path === "status.json")?.sourceDigest !== job.statusDigest ||
        source.files.find(file=>file.path === "result.json")?.sourceDigest !== job.result?.digest)
      throw new Error("Legacy receipt changed before archive");
  if (sources.reduce((sum,item)=>sum+item.snapshot.bytes,0)>256*1024*1024 || sources.reduce((sum,item)=>sum+item.snapshot.files.length,0)>10000)
    throw new Error("Combined legacy archive bound exceeded");
  mkdirSync(destination,{mode:0o700});
  try {
    if (realpathSync(destination) !== destination) throw new Error("Archive destination uses aliases");
    for (const {job,snapshot:source} of sources) {
      const target = join(destination,job.id); mkdirSync(target,{mode:0o700});
      for (const directory of source.directories) mkdirSync(join(target,directory),{mode:0o700});
      for (const member of source.files) {
        const captured = worktreeBytes(job.directory,member.path,16*1024*1024);
        if (captured.type !== "regular" || hash(captured.bytes) !== member.sourceDigest) throw new Error("Legacy source changed during archive");
        const fd = openSync(join(target,member.path),"wx",0o600);
        try { writeFileSync(fd,captured.bytes); fsyncSync(fd); } finally { closeSync(fd); }
      }
      const copied = snapshot(target);
      if (digest(copied) !== digest({...source,files:source.files.map(member=>({...member,mode:0o600}))})) throw new Error("Legacy archive readback differs");
      for (const path of [...source.directories].reverse().map(name=>join(target,name)).concat(target)) {
        const fd = openSync(path,"r");
        try { fsyncSync(fd); } finally { closeSync(fd); }
      }
    }
    for (const {job,snapshot:source} of sources)
      if (digest(snapshot(job.directory)) !== digest(source)) throw new Error("Legacy source membership or bytes changed");
    if (digest(legacyJobInventory(workspace,store)) !== digest(inventory)) throw new Error("Legacy inventory changed during archive");
    const receipt = {version:1,state:"verified",kind:"legacy-history-archive",inventory,
      records:sources.map(({job,snapshot})=>({id:job.id,...snapshot})),
      scope:"selected-job-directory-contents",drain:"unverified",externalReferences:"not-verified"};
    if (Buffer.byteLength(canonical(receipt)+"\n") > 1024*1024) throw new Error("Legacy archive receipt exceeds readback bound");
    durableJson(join(destination,"archive.json"),receipt);
    return receipt;
  } catch (error) {
    durableJson(join(destination,"archive.json"),{version:1,state:"failed",reason:"Incomplete archive; original legacy state retained"});
    throw error;
  }
}
