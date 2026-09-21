import { lstatSync, realpathSync } from "node:fs";
import { resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { parseArgs } from "node:util";
import { resourceRegistryPath } from "./resources.ts";

/** Inspect the schema-independent version without initializing a registry or interpreting its tables. */
export function resourceStatus(path = resourceRegistryPath()) {
  path=resolve(path);
  let stat;
  try {stat=lstatSync(path);} catch(error) {
    if((error as NodeJS.ErrnoException).code==="ENOENT")return {registry:path,state:"missing",protocol:null,supportedProtocol:2};
    throw error;
  }
  if(!stat.isFile() || stat.isSymbolicLink() || realpathSync(path)!==path)throw new Error("Resource status requires an ordinary canonical registry");
  const database=new DatabaseSync(path,{readOnly:true});
  try {
    const protocol=Number(database.prepare("PRAGMA user_version").get()!.user_version);
    return {registry:path,protocol,supportedProtocol:2,
      scope:"protocol-only",state:protocol===2?"protocol-compatible":protocol===1?"migration-required":"incompatible"};
  }finally{database.close();}
}

export function resourceStatusCommand(args: string[]) {
  const {values}=parseArgs({args,strict:true,allowPositionals:false,options:{registry:{type:"string"}}});
  return resourceStatus(values.registry);
}
