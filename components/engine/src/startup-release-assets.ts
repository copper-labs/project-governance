import {createHash} from "node:crypto";
import {object} from "./core.ts";
import {compiledRuntimeLock} from "./runtime-lock.ts";
import {compatibleStartupCandidate, StartupApprovalRequired} from "./startup-compatibility.ts";
import type {StartupHttp} from "./startup-http.ts";

/** Inspect selected immutable release metadata; archive bytes still require installation verification. */
export async function startupReleaseCandidate(currentValue:unknown,releaseValue:unknown,client:Pick<StartupHttp,"api"|"read">) {
  const current=compiledRuntimeLock(currentValue),release=object(releaseValue);
  const owner=/^https:\/\/github\.com\/([^/]+\/[^/]+)\/releases\/download\//u.exec(current.artifact.url)?.[1];
  if(!owner || client.api!==`https://api.github.com/repos/${owner}`)throw new Error("Startup release client differs from lock owner");
  if(release.immutable!==true || release.draft!==false || release.prerelease!==false)throw new StartupApprovalRequired("Startup requires an immutable stable release");
  if(!Array.isArray(release.assets) || release.assets.length>256)throw new Error("Invalid startup asset inventory");
  const assets=release.assets.map(value=>object(value));
  const asset=(name:string)=>{
    const matches=assets.filter(value=>value.name===name);
    if(matches.length!==1)throw new StartupApprovalRequired("Missing or ambiguous startup asset");
    const record=matches[0]!;
    if(record.state!=="uploaded" || typeof record.digest!=="string" || !/^sha256:[a-f0-9]{64}$/u.test(record.digest) ||
       typeof record.url!=="string" || !record.url.startsWith(client.api+"/releases/assets/") ||
       !/^[0-9]+$/u.test(record.url.slice((client.api+"/releases/assets/").length)) ||
       !Number.isSafeInteger(record.size) || (record.size as number)<1)throw new Error("Invalid startup asset identity");
    return {name,url:record.url,digest:record.digest,size:record.size as number,browserUrl:record.browser_download_url};
  };
  const read=async(name:string)=>{
    const record=asset(name);
    if(record.size>1024*1024)throw new Error("Startup metadata asset exceeds size limit");
    const bytes=await client.read(record.url,1024*1024,true);
    if(bytes.length!==record.size || `sha256:${createHash("sha256").update(bytes).digest("hex")}`!==record.digest)
      throw new Error("Startup asset bytes differ from published identity");
    return bytes;
  };
  const metadata=JSON.parse(new TextDecoder("utf-8",{fatal:true}).decode(await read("runtime-update.json")));
  const lockBytes=await read("runtime.lock.yaml"),lock=compatibleStartupCandidate(current,lockBytes,metadata);
  if(lock.version!==release.tag_name)throw new Error("Startup release tag differs from lock");
  const filename=new URL(lock.artifact.url).pathname.split("/").at(-1)!;
  const archive=asset(filename);
  if(archive.browserUrl!==lock.artifact.url)throw new Error("Startup archive belongs to a different release");
  return {lock,lockText:new TextDecoder().decode(lockBytes),metadata,archive,
    authority:"candidate-only" as const,archiveVerification:"required-before-installation" as const};
}

/** Revalidate release metadata and both package hashes before handing bytes to installation. */
export async function downloadStartupArchive(currentValue:unknown,releaseValue:unknown,client:Pick<StartupHttp,"api"|"read">) {
  const candidate=await startupReleaseCandidate(currentValue,releaseValue,client);
  const {archive,lock}=candidate;
  if(archive.size>16*1024*1024)throw new Error("Startup archive exceeds download limit");
  const bytes=await client.read(archive.url,archive.size,true);
  if(bytes.length!==archive.size || `sha256:${createHash("sha256").update(bytes).digest("hex")}`!==archive.digest)
    throw new Error("Startup archive differs from published asset identity");
  if(`sha512-${createHash("sha512").update(bytes).digest("base64")}`!==lock.artifact.integrity)
    throw new Error("Startup archive differs from pinned integrity");
  return {candidate,bytes,verification:{size:bytes.length,sha256:archive.digest,integrity:lock.artifact.integrity},
    authority:"verified-download-only" as const};
}
