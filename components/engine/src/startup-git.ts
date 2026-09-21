import {execFileSync} from "node:child_process";
import {closeSync,constants,fstatSync,lstatSync,openSync,readdirSync,readlinkSync,readSync,realpathSync} from "node:fs";
import {dirname,join} from "node:path";
import {createHash} from "node:crypto";
import {narrativeFile} from "./narrative-inputs.ts";
import {digest} from "./core.ts";

const lockPath="config/governance/runtime.lock.yaml";
const prefixes=["config/governance/","config/validation/",".githooks/",".codex/",".claude/",".agents/"];
const entries=new Set(["AGENTS.md","AGENTS.override.md","CLAUDE.md","GEMINI.md","tools/governance-bootstrap.py","tools/governance-startup.py"]);
const authority=(path:string)=>entries.has(path)||prefixes.some(prefix=>path.startsWith(prefix));

/** Read-only admission. A later transaction must still fingerprint and preserve unrelated work. */
export function startupGitAdmission(workspace:string,environment:NodeJS.ProcessEnv=process.env) {
 return collectAdmission(workspace,environment);
}
interface LockTransition {original:string;candidate:string}
function collectAdmission(workspace:string,environment:NodeJS.ProcessEnv,transition?:LockTransition) {
 for(const name of ["GIT_DIR","GIT_WORK_TREE","GIT_COMMON_DIR","GIT_INDEX_FILE","GIT_OBJECT_DIRECTORY","GIT_ALTERNATE_OBJECT_DIRECTORIES","GOVERNANCE_UPDATE_TOKEN"])
  if(environment[name])throw new Error("Startup cannot run inside a redirected Git or update transaction");
 const root=realpathSync(workspace);
 const git=(...args:string[])=>execFileSync("git",args,{cwd:root,env:{...environment,GIT_OPTIONAL_LOCKS:"0"},
  timeout:5000,maxBuffer:16*1024*1024,stdio:["ignore","pipe","pipe"]});
 const text=(...args:string[])=>new TextDecoder("utf-8",{fatal:true}).decode(git(...args));
 const names=(...args:string[])=>text(...args).split("\0").filter(Boolean);
 if(realpathSync(text("rev-parse","--show-toplevel").trim())!==root)throw new Error("Startup requires the Git worktree root");
 for(const marker of ["MERGE_HEAD","REBASE_HEAD","CHERRY_PICK_HEAD","REVERT_HEAD","rebase-merge","rebase-apply","sequencer","index.lock","HEAD.lock","packed-refs.lock"]){
  const path=text("rev-parse","--path-format=absolute","--git-path",marker).trim();
  if(lstatSync(path,{throwIfNoEntry:false}))throw new Error("Git has an active operation: "+marker);
 }
 const branch=text("symbolic-ref","--quiet","HEAD").trim(),head=text("rev-parse","--verify","HEAD").trim();
 if(!branch.startsWith("refs/heads/") || !/^[a-f0-9]{40}(?:[a-f0-9]{24})?$/u.test(head))throw new Error("Startup requires a committed branch");
 if(git("ls-files","--unmerged","-z").length)throw new Error("Resolve Git conflicts before startup adoption");
 const changed=[...new Set([...names("diff","--no-renames","--name-only","-z","HEAD"),
  ...names("diff","--cached","--no-renames","--name-only","-z"),...names("ls-files","--others","--exclude-standard","-z")])].sort();
 if(changed.length>2048)throw new Error("Startup changed-file inventory exceeds limit");
 for(const path of changed)if(authority(path) && !(transition && path===lockPath))throw new Error("Existing changes overlap governance authority: "+path);
 const tracked=names("ls-files","-z");
 // Source development is never an automatic adopter, even when its checkout is otherwise clean.
 if(tracked.includes("src/project_governance_runtime/startup.py") || tracked.includes("components/engine/src/startup-command.ts"))
  throw new Error("Automatic startup adoption is unavailable in a runtime source checkout");
 const selected=tracked.filter(authority).sort();
 const contents:Record<string,string>={};
 for(const path of selected){
  if(realpathSync(join(root,path))!==join(root,path))throw new Error("Governance authority cannot follow symbolic links");
  const content=narrativeFile(root,path),committed=text("show",`${head}:${path}`);
  if(transition && path===lockPath){
   const indexed=text("show",`:${path}`);
   if(content!==transition.candidate || ![transition.original,transition.candidate].includes(committed) ||
      ![transition.original,transition.candidate].includes(indexed))throw new Error("Runtime lock differs from prepared transition");
   contents[path]=transition.original;continue;
  }
  if(content!==committed || text("show",`:${path}`)!==committed)throw new Error("Governance authority differs from committed content: "+path);
  contents[path]=content;
 }
 if(!Object.hasOwn(contents,lockPath))throw new Error("Committed runtime lock required");
 return {workspace:root,branch,head,changed:transition?changed.filter(path=>path!==lockPath):changed,
  lockDigest:digest(contents[lockPath]),authorityDigest:digest(contents),authorityPaths:selected,
  admission:"preflight-only" as const};
}

/** Bind actual unrelated contents, not just the names printed by Git status. */
export function startupGitSnapshot(workspace:string,environment:NodeJS.ProcessEnv=process.env) {
 return collectSnapshot(workspace,environment);
}
function collectSnapshot(workspace:string,environment:NodeJS.ProcessEnv,transition?:LockTransition) {
 const admission=collectAdmission(workspace,environment,transition),root=admission.workspace;
 const files:Record<string,unknown>={};let remaining=128*1024*1024;
 for(const name of admission.changed) {
  const path=join(root,name),entry=lstatSync(path,{throwIfNoEntry:false});
  if(!entry){files[name]={absent:true};continue;}
  if(realpathSync(dirname(path))!==dirname(path))throw new Error("Changed path has a redirected parent");
  if(entry.isSymbolicLink()){files[name]={link:readlinkSync(path)};continue;}
  const fd=openSync(path,constants.O_RDONLY|constants.O_NOFOLLOW|constants.O_NONBLOCK);
  try {
   const before=fstatSync(fd);
   if(!before.isFile() || before.size>64*1024*1024 || before.size>remaining)throw new Error("Changed-file fingerprint budget exceeded");
   remaining-=before.size;
   const hash=createHash("sha256"),buffer=Buffer.alloc(65536);let bytes=0;
   while(true){const count=readSync(fd,buffer,0,buffer.length,null);if(!count)break;bytes+=count;
    if(bytes>before.size)throw new Error("Changed file grew during snapshot");hash.update(buffer.subarray(0,count));}
   const after=fstatSync(fd);
   if(bytes!==before.size || before.mtimeMs!==after.mtimeMs || before.ctimeMs!==after.ctimeMs)
    throw new Error("Changed file moved during snapshot");
   files[name]={mode:before.mode&0o7777,sha256:hash.digest("hex")};
  }finally{closeSync(fd);}
 }
 const query=(...args:string[])=>execFileSync("git",args,{cwd:root,env:{...environment,GIT_OPTIONAL_LOCKS:"0"},
  timeout:5000,maxBuffer:16*1024*1024,stdio:["ignore","pipe","pipe"]});
 const index=query("ls-files","--stage","-z");
 const indexRows=new TextDecoder("utf-8",{fatal:true}).decode(index).split("\0").filter(Boolean);
 const unrelatedIndexDigest=digest(indexRows.filter(row=>!row.endsWith(`\t${lockPath}`)));
 const lockMode=indexRows.find(row=>row.endsWith(`\t${lockPath}`))?.split(" ")[0];
 if(!lockMode || !["100644","100755"].includes(lockMode))throw new Error("Runtime lock index mode is invalid");
 const lockExecutable=Boolean(lstatSync(join(root,lockPath)).mode&0o111);
 // Store only the digest: Git configuration can contain credential-bearing URLs.
 const configurationDigest=`sha256:${createHash("sha256").update(query("config","--null","--list","--show-origin","--show-scope")).digest("hex")}`;
 const hookPath=new TextDecoder("utf-8",{fatal:true}).decode(query("rev-parse","--path-format=absolute","--git-path","hooks")).trim();
 const hooks:Record<string,unknown>={},hookDirectory=lstatSync(hookPath,{throwIfNoEntry:false});
 if(hookDirectory){
  if(!hookDirectory.isDirectory() || realpathSync(hookPath)!==hookPath)throw new Error("Effective Git hook directory requires reconciliation");
  const names=readdirSync(hookPath).sort();if(names.length>256)throw new Error("Effective Git hook inventory exceeds limit");
  for(const name of names){
   const path=join(hookPath,name),entry=lstatSync(path);
   if(!entry.isFile())throw new Error("Effective Git hook is not an ordinary file");
   hooks[name]={mode:entry.mode&0o7777,digest:digest(narrativeFile(root,path))};
  }
 }
 const snapshot={...admission,files,indexDigest:`sha256:${createHash("sha256").update(index).digest("hex")}`,unrelatedIndexDigest,lockMode,lockExecutable,
  configurationDigest,hookPath,hooks};
 // Detect changes to the branch, authority and changed-path set while collecting file contents.
 if(digest(collectAdmission(root,environment,transition))!==digest(admission))throw new Error("Git state changed during startup snapshot");
 return snapshot;
}

/** Permit only the prepared lock bytes, preserving every unrelated snapshot field. */
export function assertStartupGitTransition(before:ReturnType<typeof startupGitSnapshot>,original:string,candidate:string,
 committed=false,environment:NodeJS.ProcessEnv=process.env) {
 if(digest(original)!==before.lockDigest || original===candidate)throw new Error("Original and candidate lock identity required");
 const current=collectSnapshot(before.workspace,environment,{original,candidate});
 if(committed){
  const git=(...args:string[])=>execFileSync("git",args,{cwd:before.workspace,env:{...environment,GIT_OPTIONAL_LOCKS:"0"},
   timeout:5000,maxBuffer:16*1024*1024,encoding:"utf8",stdio:["ignore","pipe","pipe"]});
  if(git("rev-list","--parents","-n","1","HEAD").trim()!==`${current.head} ${before.head}` ||
    git("diff-tree","--no-commit-id","--name-only","--no-renames","-r","-z","HEAD")!==`${lockPath}\0` ||
    git("show",`HEAD:${lockPath}`)!==candidate || git("show",`:${lockPath}`)!==candidate)
   throw new Error("Startup commit differs from the isolated lock transition");
 }
 const normalize=(value:typeof current)=>{const {indexDigest,head,...rest}=value;return committed?rest:{head,...rest};};
 if(digest(normalize(current))!==digest(normalize(before)))throw new Error("Project work changed during startup transition");
 return current.head;
}

/** Preparation must not reuse a parent assessment after any captured work changes. */
export function assertStartupGitSnapshot(before:ReturnType<typeof startupGitSnapshot>,environment:NodeJS.ProcessEnv=process.env) {
 if(digest(startupGitSnapshot(before.workspace,environment))!==digest(before))
  throw new Error("Project work changed after startup assessment; reassessment required");
}
