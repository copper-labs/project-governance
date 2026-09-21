import {object} from "./core.ts";
import {stableStartupVersion} from "./startup-compatibility.ts";

const compare=(a:number[],b:number[])=>a[0]!-b[0]! || a[1]!-b[1]! || a[2]!-b[2]!;
/** The transport must enforce its own response-size and deadline bounds. No partial inventory is usable. */
export async function startupReleaseInventory(currentVersion:string,loadPage:(page:number)=>Promise<unknown>) {
  const current=stableStartupVersion(currentVersion);
  const releases:Record<string,unknown>[]=[];
  let complete=false;
  for(let page=1;page<=4;page++) {
    const raw=await loadPage(page);
    if(!Array.isArray(raw) || raw.length>100)throw new Error("Invalid startup release page");
    releases.push(...raw.map(value=>object(value,"startup release")));
    if(raw.length<100){complete=true;break;}
  }
  if(!complete)throw new Error("Startup release listing exceeds discovery bound");
  const candidates:Array<{version:number[];release:Record<string,unknown>}>=[];
  let major:number[]|null=null;
  const seen=new Set<string>();
  for(const release of releases) {
    if(release.draft!==false || release.prerelease!==false)continue;
    let version:number[];
    try{version=stableStartupVersion(release.tag_name);}catch{continue;}
    const tag=String(release.tag_name);
    if(seen.has(tag))throw new Error("Duplicate startup release identity");
    seen.add(tag);
    if(version[0]!>current[0]!) {if(major===null || compare(version,major)>0)major=version;}
    else if(version[0]===current[0] && compare(version,current)>0)candidates.push({version,release});
  }
  candidates.sort((a,b)=>compare(b.version,a.version));
  return {complete:true as const,inspected:releases.length,
    candidates:candidates.slice(0,4).map(value=>value.release),major:major?.join(".")??null,
    authority:"inventory-only" as const};
}
