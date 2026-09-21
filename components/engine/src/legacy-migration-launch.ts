import { compiledRuntimeLock } from "./runtime-lock.ts";
import { digest } from "./core.ts";
import { lstatSync, realpathSync } from "node:fs";
import { join } from "node:path";
import { parse } from "yaml";
import { legacyRuntimeLock } from "./legacy-runtime-lock.ts";
import { narrativeFile } from "./narrative-inputs.ts";
import { createHash } from "node:crypto";

// Transition-only use of the old interpreter: exec replaces it; the selected Node process owns the lock.
const handoff = `import os,sys,fcntl,stat,hashlib
from pathlib import Path
root=Path(sys.argv[1])
if Path(sys.prefix).resolve() != (root/'.governance/runtime').resolve():
 raise RuntimeError('Legacy interpreter installation differs')
path=root/'.governance/runtime-use.lock'
fd=os.open(path,os.O_RDWR|os.O_NOFOLLOW)
try:
 info=os.fstat(fd)
 if not stat.S_ISREG(info.st_mode): raise RuntimeError('Invalid legacy runtime lock')
 fcntl.flock(fd,fcntl.LOCK_EX|fcntl.LOCK_NB)
 current=os.stat(path,follow_symlinks=False)
 if (current.st_dev,current.st_ino)!=(info.st_dev,info.st_ino): raise RuntimeError('Legacy lock replaced')
 if (root/'.governance/startup/transaction.json').exists(): raise RuntimeError('Legacy update requires recovery')
 identity_path=root/'config/governance/runtime.lock.yaml'
 identity_fd=os.open(identity_path,os.O_RDONLY|os.O_NOFOLLOW|os.O_NONBLOCK)
 try:
  if not stat.S_ISREG(os.fstat(identity_fd).st_mode): raise RuntimeError('Invalid legacy package lock')
  identity=os.read(identity_fd,1048577)
  if len(identity)>1048576 or hashlib.sha256(identity).hexdigest()!=sys.argv[2]: raise RuntimeError('Legacy package lock changed before migration')
 finally: os.close(identity_fd)
 script_fd=os.open(sys.argv[5],os.O_RDONLY|os.O_NOFOLLOW|os.O_NONBLOCK)
 try:
  if not stat.S_ISREG(os.fstat(script_fd).st_mode): raise RuntimeError('Invalid migration script')
  script=os.read(script_fd,1048577)
  if len(script)>1048576 or hashlib.sha256(script).hexdigest()!=sys.argv[3]: raise RuntimeError('Migration script changed before handoff')
 finally: os.close(script_fd)
 os.set_inheritable(fd,True)
 os.environ['GOVERNANCE_LEGACY_LOCK_FD']=str(fd)
 os.execv(sys.argv[4],sys.argv[4:])
finally:
 os.close(fd)
`;

/** Construct a one-time locked migration invocation; ordinary runtime commands never use Python. */
export function legacyMigrationInvocation(workspace: string, migrationScript: string, args: string[] = [], recoveryOperation?: string) {
  workspace = realpathSync(workspace);
  const lockBytes = narrativeFile(workspace,"config/governance/runtime.lock.yaml");
  const currentLock=parse(lockBytes);
  if(currentLock?.schema_version===1)legacyRuntimeLock(currentLock);
  else {
    compiledRuntimeLock(currentLock);
    if(!recoveryOperation)throw new Error("Compiled lock requires a saved legacy recovery operation");
    const saved=JSON.parse(narrativeFile(workspace,join(realpathSync(recoveryOperation),"operation.json")));
    if(saved.legacyLockRequired!==true || saved.request?.workspace!==workspace ||
        saved.requestDigest!==digest(saved.request) || saved.owner!==`installation:${realpathSync(recoveryOperation)}`)
      throw new Error("Legacy recovery operation binding differs");
  }
  const lockDigest = createHash("sha256").update(lockBytes).digest("hex");
  const governance = join(workspace,".governance");
  if (realpathSync(governance) !== governance) throw new Error("Legacy governance directory uses aliases");
  const lock = join(governance,"runtime-use.lock");
  if (!lstatSync(lock).isFile() || lstatSync(lock).isSymbolicLink()) throw new Error("Existing ordinary legacy runtime lock required");
  migrationScript = realpathSync(migrationScript);
  if (!lstatSync(migrationScript).isFile()) throw new Error("Migration script must be an ordinary file");
  const scriptDigest = createHash("sha256").update(narrativeFile(workspace,migrationScript)).digest("hex");
  if (args.length>256 || args.some(arg=>typeof arg!=="string" || arg.includes("\0") || arg.length>16384)) throw new Error("Invalid migration arguments");
  return {argv:[join(governance,"runtime/bin/python"),"-I","-c",handoff,workspace,lockDigest,scriptDigest,realpathSync(process.execPath),migrationScript,...args],cwd:workspace};
}
