import { androidEmulatorAdapter } from "./android-emulator.ts";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { dirname, resolve, isAbsolute } from "node:path";
import { realpathSync, statSync } from "node:fs";
import { object, text, digest } from "./core.ts";
import { outsideRoots } from "./provider-guard.ts";
import { commandEnvironment } from "./process-owner.ts";
import { absentLock } from "./ios-observation-cleanup.ts";
import type { Recipe } from "./workflow-types.ts";
const exec=promisify(execFile);
export interface AndroidAppSession {
  ownership:"borrowed"|"owned-emulator"; emulator?:{bootStage:string;lockPath:string}; serial:string; adb:string; userId:number;
  localLocks:Array<{resource:string;path:string}>;
}
export type AndroidAppProbe=(args:string[])=>Promise<{stdout:string;stderr:string;exitCode:number}>;

/** One explicit borrowed target; resource identities stay in the original project policy. */
export function androidAppSession(raw:unknown,workspace:string):AndroidAppSession {
  const value=object(raw);
  if(Object.keys(value).some(key=>!["ownership","serial","adb","userId","localLocks","emulator"].includes(key))||!["borrowed","owned-emulator"].includes(String(value.ownership))||!Number.isSafeInteger(value.userId)||Number(value.userId)<0||Number(value.userId)>21474)throw Error("Explicit Android lifetime, user and target required");
  const serial=text(value.serial,"Android serial",128),adb=text(value.adb,"ADB path");
  if(!/^[A-Za-z0-9_-]+$/u.test(serial)||!isAbsolute(adb)||realpathSync(adb)!==adb||!statSync(adb).isFile()||!(statSync(adb).mode&0o111))throw Error("Exact USB/emulator serial and canonical executable ADB required");
  outsideRoots(adb,[realpathSync(workspace)]);
  if(!Array.isArray(value.localLocks)||value.localLocks.length>64)throw Error("Bounded local claim/lock mappings required");
  const localLocks=value.localLocks.map(raw=>{const row=object(raw);if(Object.keys(row).sort().join()!=="path,resource")throw Error("Exact local lock mapping required");const resource=text(row.resource,"local claim"),path=text(row.path,"local lock path");if(/^(?:android|ios|app:|workspace-v1:|simulator:|emulator:|device:|tcp:|port:|metro:|service:|remote:)/u.test(resource)||!isAbsolute(path)||resolve(path)!==path||realpathSync(dirname(path))!==dirname(path)||!statSync(dirname(path)).isDirectory())throw Error("Local claim cannot substitute device custody");return{resource,path};});
  if(new Set(localLocks.map(x=>x.resource)).size!==localLocks.length||new Set(localLocks.map(x=>x.path)).size!==localLocks.length)throw Error("Duplicate local claim/lock mapping");
  let emulator:AndroidAppSession["emulator"];
  if(value.ownership==="owned-emulator"){
    const owned=object(value.emulator);
    if(Object.keys(owned).sort().join()!=="bootStage,lockPath")throw Error("Original boot stage and emulator ownership lock required");
    const bootStage=text(owned.bootStage,"emulator boot stage",128),lockPath=text(owned.lockPath,"emulator ownership lock");
    androidEmulatorAdapter({serial,adb,lockPath},workspace);
    if(resolve(lockPath)!==lockPath||realpathSync(dirname(lockPath))!==dirname(lockPath)||!statSync(dirname(lockPath)).isDirectory())throw Error("Canonical emulator ownership lock required");
    emulator={bootStage,lockPath};
  }else if(value.emulator!==undefined)throw Error("Borrowed session cannot claim emulator boot ownership");
  return{ownership:value.ownership as AndroidAppSession["ownership"],serial,adb,userId:Number(value.userId),localLocks,...(emulator?{emulator}:{})};
}

/** Public parse/admission rejects an unsupported closure shape before it can acquire anything. */
export function assertAndroidAppSession(recipe:Pick<Recipe,"resources"|"androidAppSession"|"androidEmulator"|"workspace">&{stages?:Recipe["stages"]}) {
  const config=recipe.androidAppSession;
  if(!config){if(recipe.resources.some(x=>x.startsWith("android:")||x.startsWith("app:")))throw Error("Android app claims require an explicit androidAppSession cleanup adapter");return;}
  if(recipe.androidEmulator)throw Error("App session cannot mix owned-emulator adapters");
  const checked=androidAppSession(config,recipe.workspace),apps=recipe.resources.filter(x=>/^app:[A-Za-z][A-Za-z0-9_]*(?:\.[A-Za-z0-9_]+)+$/u.test(x));
  if(checked.ownership==="owned-emulator"&&!recipe.stages?.some(stage=>stage.id===checked.emulator!.bootStage&&!stage.cleanup))throw Error("Original ordinary emulator boot stage required");
  const expected=[`android:${checked.serial}`,...apps,...checked.localLocks.map(x=>x.resource)].sort();
  if(!apps.length||new Set(recipe.resources).size!==recipe.resources.length||digest(expected)!==digest([...recipe.resources].sort()))throw Error("Android session must bind exact serial, packages and every local claim");
}

const quote=(value:string)=>"'"+value.replaceAll("'","'\\''")+"'";
/** No app/server/emulator control is performed. Raw package/process inventories never enter receipts. */
export async function observeAndroidAppSession(resources:readonly string[],raw:AndroidAppSession,workspace:string,probe?:AndroidAppProbe) {
  try {
    const config=androidAppSession(raw,workspace);if(config.ownership!=="borrowed")return null;assertAndroidAppSession({workspace,resources:[...resources],androidAppSession:config});
    const call=probe??(async(args:string[])=>{const result=await exec(config.adb,args,{timeout:5000,maxBuffer:4*1024*1024,env:commandEnvironment({})});return{...result,exitCode:0};});
    const read=async(args:string[])=>{const result=await call(args);if(result.exitCode!==0||result.stderr||typeof result.stdout!=="string"||result.stdout.length>4*1024*1024)throw Error("ADB transport observation unavailable");return result.stdout;};
    const shell=async(args:string[])=>{
      const script=args.map(quote).join(" ")+`; governance_status=$?; printf '\\n__GOVERNANCE_REMOTE_STATUS__:%s\\n' "$governance_status"; exit 0`;
      const output=await read(["-s",config.serial,"shell","sh","-c",quote(script)]),match=/\n__GOVERNANCE_REMOTE_STATUS__:(\d+)\r?\n$/u.exec(output);
      if(!match||match[1]!=="0")throw Error("Complete successful Android shell observation required");
      return output.slice(0,match.index).trim();
    };
    const inventory=await read(["devices"]),lines=inventory.trim().split(/\r?\n/u);
    if(lines.shift()!=="List of devices attached")throw Error("ADB inventory unavailable");
    const entries=lines.map(line=>{const m=/^(\S+)\s+(device|offline|unauthorized|recovery|sideload|bootloader)(?:\s+.*)?$/u.exec(line);if(!m)throw Error("Ambiguous ADB inventory");return{serial:m[1],state:m[2]};});
    if(new Set(entries.map(x=>x.serial)).size!==entries.length||entries.find(x=>x.serial===config.serial)?.state!=="device")throw Error("Exact Android target unavailable");
    if(await shell(["am","get-current-user"])!==String(config.userId))throw Error("Android user changed or ambiguous");
    const packageUids=(output:string)=>{const values=new Map<string,number>();
      for(const line of output.split(/\r?\n/u)){const m=/^package:([A-Za-z][A-Za-z0-9_]*(?:\.[A-Za-z0-9_]+)*) uid:(\d+)$/u.exec(line);if(!m||values.has(m[1]!))throw Error("Package identity unavailable");const uid=Number(m[2]);if(!Number.isSafeInteger(uid)||Math.floor(uid/100000)!==config.userId)throw Error("Package user identity differs");values.set(m[1]!,uid);}return values;};
    const uids=packageUids(await shell(["cmd","package","list","packages","--user",String(config.userId),"-U"]));
    const names=resources.filter(x=>x.startsWith("app:")).map(x=>x.slice(4));
    if(names.some(name=>!uids.has(name)))throw Error("Selected package identity unavailable");
    const output=await shell(["ps","-A","-w","-n","-o","PID,UID,NAME"]),rows=output.split(/\r?\n/u);
    if(rows.shift()?.trim().split(/\s+/u).join(" ")!=="PID UID NAME"||!rows.length)throw Error("Complete wide process table required");
    const pids=new Set<number>();let isolatedOwnershipNeeded=false;
    for(const row of rows){const m=/^\s*([1-9]\d*)\s+(\d+)\s+(\S(?:[^\r\n]*\S)?)\s*$/u.exec(row);if(!m||!Number.isSafeInteger(Number(m[1]))||!Number.isSafeInteger(Number(m[2]))||pids.has(Number(m[1])))throw Error("Process inventory ambiguous");pids.add(Number(m[1]));const uid=Number(m[2]),name=m[3]!,appId=uid%100000;
      // An isolated UID alone does not identify its package. Ask Android for selected-UID ownership.
      if(Math.floor(uid/100000)===config.userId&&appId>=90000)isolatedOwnershipNeeded=true;
      if(names.some(pkg=>uid===uids.get(pkg)||(Number(uids.get(pkg))%100000>=10000&&Number(uids.get(pkg))%100000<20000&&uid===Number(uids.get(pkg))+10000)||((name===pkg||name.startsWith(pkg+":"))&&Math.floor(uid/100000)===config.userId)))throw Error("Selected app/service remains present");}
    const isolatedOwnership:Array<{uid:number;output:string}>=[];
    const confirmIsolatedAbsence=async()=>{
      if(!isolatedOwnershipNeeded)return;
      for(const uid of new Set(names.map(name=>uids.get(name)!))){
        const output=await shell(["cmd","activity","get-isolated-pids",String(uid)]);
        if(output!=="[]")throw Error("Selected isolated processes remain present or ownership is unavailable");
        isolatedOwnership.push({uid,output});
      }
    };
    await confirmIsolatedAbsence();
    // Re-read user/identity after enumeration; another user or package cannot substitute for closure.
    if(await shell(["am","get-current-user"])!==String(config.userId))throw Error("Android user changed during cleanup");
    const currentUids=packageUids(await shell(["cmd","package","list","packages","--user",String(config.userId),"-U"]));
    if(names.some(name=>currentUids.get(name)!==uids.get(name)))throw Error("Selected Android package identity changed during cleanup");
    await confirmIsolatedAbsence();
    for(const lock of config.localLocks)absentLock(lock.path);
    return{kind:"android-app-session-cleanup",version:1,serial:config.serial,userId:config.userId,
      packages:names.map(name=>({name,uid:uids.get(name),processAbsent:true})),localLocks:config.localLocks,localLocksAbsent:true,
      inventoryDigest:digest(inventory),processInventoryDigest:digest(isolatedOwnership.length?{processes:output,isolatedOwnership}:output),borrowedLifecycle:"retained",sdkLifecycle:"unclaimed",observedAt:new Date().toISOString()};
  } catch {return null;}
}
