import {startupMetadataCache} from "./startup-metadata-cache.ts";
import {compiledRuntimeLock} from "./runtime-lock.ts";
import {startupPolicy} from "./startup-policy.ts";
import {stableStartupVersion, StartupApprovalRequired} from "./startup-compatibility.ts";
import {StartupHttp} from "./startup-http.ts";
import {startupReleaseInventory} from "./startup-release-inventory.ts";
import {startupReleaseCandidate} from "./startup-release-assets.ts";

/** Discovery is read-only. Host admission must happen before calling; no result authorizes activation. */
export async function discoverStartupRelease(profile:unknown,currentValue:unknown,
 options:{token?:string;fetch?:typeof fetch;cachePath?:string}={}) {
 const settings=startupPolicy(profile);
 if(settings.policy!=="compatible")return {status:"manual" as const,reason:"repository-policy"};
 const current=compiledRuntimeLock(currentValue);
 // Prereleases and local archives have no automatic stable-release upgrade path.
 if(current.version.includes("-"))return {status:"manual" as const,reason:"prerelease-runtime"};
 stableStartupVersion(current.version);
 const match=/^https:\/\/github\.com\/([A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+)\/releases\/download\/([^/]+)\/[^/]+\.tgz$/u.exec(current.artifact.url);
 if(!match || match[2]!==current.version)return {status:"manual" as const,reason:"unsupported-distribution"};
 const cache=options.cachePath?startupMetadataCache(options.cachePath,{current,settings,authenticated:Boolean(options.token)},settings.cache_seconds):undefined;
 const discoveryFresh=!cache?.metadata.replay;
 const client=new StartupHttp(match[1]!,settings.discovery_seconds,{...options,...(cache?{metadata:cache.metadata}:{})});
 const discover=async()=>{
 const inventory=await startupReleaseInventory(current.version,page=>client.json(`${client.api}/releases?per_page=100&page=${page}`));
 if(!inventory.candidates.length)return inventory.major
  ? {status:"approval-required" as const,version:inventory.major,reason:"major-version"}
  : {status:"current" as const,version:current.version,inspected:inventory.inspected};
 const refused:Array<{version:string;reason:string}>=[];
 for(const release of inventory.candidates) {
  try {
   const candidate=await startupReleaseCandidate(current,release,client);
   return {status:"available" as const,candidate,newerMajor:inventory.major,refused};
  }catch(error) {
   if(!(error instanceof StartupApprovalRequired))throw error;
   refused.push({version:String(release.tag_name),reason:error.message});
  }
 }
 return {status:"approval-required" as const,version:refused[0]!.version,reason:"candidate-compatibility",refused};
 };
 const result=await discover();cache?.commit();return {...result,discoveryFresh};
}
