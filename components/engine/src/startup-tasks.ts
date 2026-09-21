import {DatabaseSync} from "node:sqlite";
import {lstatSync,mkdirSync} from "node:fs";
import {dirname} from "node:path";
import {canonical,digest} from "./core.ts";
import {startupEvent} from "./startup-event.ts";
import type {StartupHostOwner} from "./startup-host-owner.ts";
import type {RuntimeReader} from "./runtime-reader.ts";

/** Task startup receipts only; generation activation remains owned by RuntimeGenerations. */
export class StartupTasks {
 readonly #db:DatabaseSync;
 constructor(path:string) {
  mkdirSync(dirname(path),{recursive:true,mode:0o700});
  const entry=lstatSync(path,{throwIfNoEntry:false});
  if(entry && !entry.isFile())throw new Error("Startup receipt store must be an ordinary file");
  this.#db=new DatabaseSync(path);
  try {
   this.#db.exec("PRAGMA busy_timeout=5000; PRAGMA synchronous=FULL; BEGIN IMMEDIATE");
   const version=this.#db.prepare("PRAGMA user_version").get()!.user_version;
   if(version===0) {
    if(this.#db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().length)throw new Error("Unknown startup receipt store");
    this.#db.exec("CREATE TABLE tasks (id TEXT PRIMARY KEY, root TEXT NOT NULL, lock_digest TEXT NOT NULL, state TEXT NOT NULL, discovery TEXT NOT NULL, result TEXT); PRAGMA user_version=1;");
   }else if(version!==1 && version!==2 && version!==3)throw new Error("Unsupported startup receipt protocol");
   if(version===0 || version===1)this.#db.exec("CREATE TABLE owners (task_id TEXT PRIMARY KEY, binding TEXT NOT NULL); PRAGMA user_version=2;");
   if(Number(version)<3)this.#db.exec("CREATE TABLE owner_history (task_id TEXT NOT NULL, binding TEXT NOT NULL, PRIMARY KEY(task_id,binding)); PRAGMA user_version=3;");
   this.#db.exec("COMMIT");
  }catch(error){try{this.#db.exec("ROLLBACK");}catch{}this.#db.close();throw error;}
 }
 close(){this.#db.close();}
 workspace(taskId:string):string|null {
  const row=this.#db.prepare("SELECT root FROM tasks WHERE id=?").get(taskId);
  return row?String(row.root):null;
 }
 bindOwner(taskId:string,host:StartupHostOwner,reader:RuntimeReader) {
  if(host.provider!=="codex" || !host.host || !host.fingerprint || !Number.isSafeInteger(host.pid) || host.pid<2 ||
    reader.owner!==`startup-task:${taskId}` || !reader.token || !Number.isSafeInteger(reader.revision))throw new Error("Invalid startup owner binding");
  const binding=canonical({host,reader});
  this.#db.exec("BEGIN IMMEDIATE");
  try {
   const task=this.#db.prepare("SELECT state FROM tasks WHERE id=?").get(taskId);
   if(task?.state!=="open")throw new Error("Open startup task required for owner binding");
   const prior=this.#db.prepare("SELECT binding FROM owners WHERE task_id=?").get(taskId);
   if(prior && prior.binding!==binding)throw new Error("Startup owner changed; reconcile the prior reservation");
   if(!prior)this.#db.prepare("INSERT INTO owners VALUES(?,?)").run(taskId,binding);
   this.#db.exec("COMMIT");
  }catch(error){this.#db.exec("ROLLBACK");throw error;}
 }
 owner(taskId:string):{host:StartupHostOwner;reader:RuntimeReader}|null {
  const row=this.#db.prepare("SELECT binding FROM owners WHERE task_id=?").get(taskId);
  return row?JSON.parse(String(row.binding)):null;
 }
 /** Intent is already durable; serialize acquisition with SessionEnd without reversing lock order. */
 reserveOwner(taskId:string,expected:{host:StartupHostOwner;reader:RuntimeReader},reserve:()=>void) {
  this.#db.exec("BEGIN IMMEDIATE");
  try {
   if(this.#db.prepare("SELECT state FROM tasks WHERE id=?").get(taskId)?.state!=="open" ||
      canonical(this.owner(taskId))!==canonical(expected))throw new Error("Startup reservation owner closed or changed");
   reserve();
   this.#db.exec("COMMIT");
  }catch(error){this.#db.exec("ROLLBACK");throw error;}
 }
 /** Hold the task transaction across finalization so SessionEnd cannot retire the old binding midway. */
 completeUpdate(taskId:string,expectedBinding:string,lockDigest:string,commit:string,
  finalize:(binding:NonNullable<ReturnType<StartupTasks["owner"]>>)=>RuntimeReader,
  retireClosed?:(reader:RuntimeReader)=>void) {
  if(![taskId,expectedBinding,lockDigest].every(value=>/^sha256:[a-f0-9]{64}$/u.test(value)) ||
    !/^[a-f0-9]{40}(?:[a-f0-9]{24})?$/u.test(commit))throw new Error("Startup update completion identity required");
  this.#db.exec("BEGIN IMMEDIATE");
  try {
   const task=this.#db.prepare("SELECT state,lock_digest,result FROM tasks WHERE id=?").get(taskId);
   if(!task)throw new Error("Startup completion task missing");
   const prior=task.result?JSON.parse(String(task.result)):null;
   if(prior?.status==="updated" && prior.previousBindingDigest===expectedBinding){
    if(prior.commit!==commit || prior.lockDigest!==lockDigest || task.lock_digest!==lockDigest)throw new Error("Startup completion replay differs");
    this.#db.exec("COMMIT");return prior;
   }
   const binding=this.owner(taskId);
   if((task.state!=="open" && !(task.state==="closed" && retireClosed)) || !binding || digest(binding)!==expectedBinding)throw new Error("Startup completion owner or task changed");
   const reader=finalize(binding),old=binding.reader;
   if(reader.registry!==old.registry || reader.owner!==old.owner || reader.token!==old.token ||
     reader.revision!==old.revision+1 || !reader.directory || reader.directory===old.directory)
    throw new Error("Startup completion did not restore the successor reader");
   const result={status:"updated",commit,lockDigest,previousBindingDigest:expectedBinding,reader};
   this.#db.prepare("INSERT OR IGNORE INTO owner_history VALUES(?,?)").run(taskId,canonical({binding,priorResult:prior,update:result}));
   if(task.state==="closed") {
    retireClosed!(reader);
    this.#db.prepare("DELETE FROM owners WHERE task_id=?").run(taskId);
   }else this.#db.prepare("UPDATE owners SET binding=? WHERE task_id=?").run(canonical({host:binding.host,reader}),taskId);
   this.#db.prepare("UPDATE tasks SET lock_digest=?,discovery='complete',result=? WHERE id=?").run(lockDigest,canonical(result),taskId);
   this.#db.exec("COMMIT");return result;
  }catch(error){this.#db.exec("ROLLBACK");throw error;}
 }
 /** Cancel only the recorded attempt; keep discovery consumed and retain its prior evidence. */
 cancelUpdate(taskId:string,expectedBinding:string,operationToken:string,
  restore:(binding:NonNullable<ReturnType<StartupTasks["owner"]>>,closed:boolean)=>void|RuntimeReader) {
  this.#db.exec("BEGIN IMMEDIATE");
  try {
   const task=this.#db.prepare("SELECT state,result FROM tasks WHERE id=?").get(taskId);
   if(!task)throw new Error("Startup cancellation task missing");
   const prior=task.result?JSON.parse(String(task.result)):null;
   if(prior?.status==="deferred" && prior.reason==="startup-update-cancelled" && prior.operationToken===operationToken){
    if(prior.previousBindingDigest!==expectedBinding)throw new Error("Startup cancellation replay differs");
    this.#db.exec("COMMIT");return prior;
   }
   const binding=this.owner(taskId);
   if(!binding || digest(binding)!==expectedBinding)throw new Error("Startup cancellation owner changed");
   const restored=restore(binding,task.state==="closed");
   if(restored && (restored.registry!==binding.reader.registry || restored.token!==binding.reader.token ||
     restored.owner!==binding.reader.owner || restored.directory!==binding.reader.directory || restored.revision!==binding.reader.revision+2))
    throw new Error("Startup restored reader identity differs");
   const result={status:"deferred",reason:"startup-update-cancelled",operationToken,previousBindingDigest:expectedBinding,
    ...(restored?{reader:restored}:{})};
   this.#db.prepare("INSERT OR IGNORE INTO owner_history VALUES(?,?)").run(taskId,canonical({binding,priorResult:prior,cancellation:result}));
   if(task.state==="closed")this.#db.prepare("DELETE FROM owners WHERE task_id=?").run(taskId);
   else if(restored)this.#db.prepare("UPDATE owners SET binding=? WHERE task_id=?").run(canonical({host:binding.host,reader:restored}),taskId);
   this.#db.prepare("UPDATE tasks SET discovery='complete',result=? WHERE id=?").run(canonical(result),taskId);
   this.#db.exec("COMMIT");return result;
  }catch(error){this.#db.exec("ROLLBACK");throw error;}
 }
 retireOwner(taskId:string,release:(binding:ReturnType<StartupTasks["owner"]>)=>void|boolean) {
  this.#db.exec("BEGIN IMMEDIATE");
  try {
   if(this.#db.prepare("SELECT state FROM tasks WHERE id=?").get(taskId)?.state!=="closed")throw new Error("Closed startup task required for retirement");
   const binding=this.owner(taskId);
   if(release(binding)===false){this.#db.exec("COMMIT");return false;}
   if(binding) {
    this.#db.prepare("INSERT OR IGNORE INTO owner_history VALUES(?,?)").run(taskId,canonical(binding));
    this.#db.prepare("DELETE FROM owners WHERE task_id=?").run(taskId);
   }
   this.#db.exec("COMMIT");return true;
  }catch(error){this.#db.exec("ROLLBACK");throw error;}
 }
 recoverOwner(taskId:string,expectedBinding:string,recover:(binding:NonNullable<ReturnType<StartupTasks["owner"]>>)=>unknown) {
  this.#db.exec("BEGIN IMMEDIATE");
  try {
   const binding=this.owner(taskId);
   if(!binding) {
    const prior=this.#db.prepare("SELECT binding FROM owner_history WHERE task_id=?").all(taskId)
      .map(row=>JSON.parse(String(row.binding))).find(value=>value.bindingDigest===expectedBinding && value.recovery);
    if(!prior)throw new Error("Recorded startup recovery binding required");
    this.#db.exec("COMMIT");return prior.recovery;
   }
   if(digest(binding)!==expectedBinding)throw new Error("Startup recovery owner binding changed");
   const recovery=recover(binding);
   this.#db.prepare("INSERT OR IGNORE INTO owner_history VALUES(?,?)").run(taskId,canonical({binding,bindingDigest:expectedBinding,recovery}));
   this.#db.prepare("DELETE FROM owners WHERE task_id=?").run(taskId);
   this.#db.prepare("UPDATE tasks SET state='closed' WHERE id=?").run(taskId);
   this.#db.exec("COMMIT");return recovery;
  }catch(error){this.#db.exec("ROLLBACK");throw error;}
 }
 event(provider:string,event:unknown,workspace:string,lockDigest:string,environment:NodeJS.ProcessEnv=process.env) {
  if(!/^sha256:[a-f0-9]{64}$/u.test(lockDigest))throw new Error("Invalid startup lock digest");
  const initial=startupEvent(provider,event,workspace,false,environment);
  if(initial.action==="defer")return initial;
  this.#db.exec("BEGIN IMMEDIATE");
  try {
   const prior=this.#db.prepare("SELECT * FROM tasks WHERE id=?").get(initial.taskId);
   const selected=startupEvent(provider,event,workspace,Boolean(prior),environment);
   if(selected.action==="defer")throw new Error("Startup event identity changed");
   if(selected.action==="close") {
    if(prior)this.#db.prepare("UPDATE tasks SET state='closed' WHERE id=?").run(selected.taskId);
    else this.#db.prepare("INSERT INTO tasks VALUES(?,?,?,'closed','not-requested',NULL)").run(selected.taskId,selected.root,lockDigest);
   }else if(prior) {
    this.#db.prepare("UPDATE tasks SET state='open' WHERE id=?").run(selected.taskId);
   }else {
    this.#db.prepare("INSERT INTO tasks VALUES(?,?,?,'open',?,NULL)").run(selected.taskId,selected.root,lockDigest,selected.discover?"pending":"not-requested");
   }
   const changed=Boolean(prior && prior.lock_digest!==lockDigest);
   this.#db.exec("COMMIT");
   return {...selected,discover:selected.discover && !changed,refreshRequired:changed,
     discovery:prior?.discovery??(selected.discover?"pending":"not-requested"),
     result:prior?.result?JSON.parse(String(prior.result)):null};
  }catch(error){this.#db.exec("ROLLBACK");throw error;}
 }
 completeDiscovery(taskId:string,lockDigest:string,result:unknown) {
  const encoded=canonical(result);
  if(Buffer.byteLength(encoded)>2*1024*1024)throw new Error("Startup discovery result exceeds limit");
  const update=this.#db.prepare("UPDATE tasks SET discovery='complete',result=? WHERE id=? AND lock_digest=? AND state='open' AND discovery='pending'").run(encoded,taskId,lockDigest);
  if(update.changes!==1)throw new Error("Startup discovery receipt is no longer pending for this identity");
 }
}
