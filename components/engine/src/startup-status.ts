import {DatabaseSync} from "node:sqlite";
import {lstatSync,realpathSync} from "node:fs";
import {digest} from "./core.ts";

/** Inspect one task without creating a store, migrating it, or changing ownership. */
export function startupStatus(receipts:string,taskId:string,scope:{workspace:string;registry:string}) {
 if(!/^sha256:[a-f0-9]{64}$/u.test(taskId))throw new Error("Startup task identity required");
 if(!lstatSync(receipts).isFile() || realpathSync(receipts)!==receipts)throw new Error("Startup receipts must be a canonical ordinary file");
 const db=new DatabaseSync(receipts,{readOnly:true});
 try {
  db.exec("PRAGMA busy_timeout=5000; BEGIN");
  const version=Number(db.prepare("PRAGMA user_version").get()!.user_version);
  if(![1,2,3].includes(version))throw new Error("Unsupported startup receipt protocol");
  const task=db.prepare("SELECT root,lock_digest,state,discovery,result FROM tasks WHERE id=?").get(taskId);
  if(!task)throw new Error("Startup task not found");
  if(task.root!==realpathSync(scope.workspace))throw new Error("Startup status workspace differs");
  const row=version>=2?db.prepare("SELECT binding FROM owners WHERE task_id=?").get(taskId):undefined;
  const binding=row?JSON.parse(String(row.binding)):null;
  if(binding && binding.reader?.registry!==realpathSync(scope.registry))throw new Error("Startup status registry differs");
  return {taskId,workspace:task.root,lockDigest:task.lock_digest,state:task.state,discovery:task.discovery,
   owner:binding,bindingDigest:binding?digest(binding):null,result:task.result?JSON.parse(String(task.result)):null,
   recovery:binding?"requires-positive-host-absence":"no-recorded-owner"};
 }finally{db.close();}
}
