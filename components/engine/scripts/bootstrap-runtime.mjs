#!/usr/bin/env node
import {createHash,randomUUID} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {closeSync,fsyncSync,linkSync,lstatSync,mkdirSync,mkdtempSync,openSync,readFileSync,realpathSync,rmSync,unlinkSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {dirname,join,resolve} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {parseArgs} from 'node:util';

function publishOnce(path,bytes,mode=0o600) {
 const temporary=path+'.'+randomUUID()+'.tmp',fd=openSync(temporary,'wx',mode);
 try{writeFileSync(fd,bytes);fsyncSync(fd);}finally{closeSync(fd);}
 try{linkSync(temporary,path);}catch(error){if(error.code!=='EEXIST')throw error;}finally{unlinkSync(temporary);}
 const parent=openSync(dirname(path),'r');try{fsyncSync(parent);}finally{closeSync(parent);}
}

/** Fetch only a locked artifact; authorization never follows a redirect. */
export async function readBootstrapArchive(location,{fetch:transport=fetch,token}={}) {
 const original=new URL(location);
 if(original.username || original.password || original.search || original.hash || !original.pathname.endsWith('.tgz'))throw new Error('Invalid locked artifact URL');
 if(original.protocol==='file:' && !original.hostname) {
  const path=fileURLToPath(original),entry=lstatSync(path);
  if(!entry.isFile() || entry.size>32*1024*1024)throw new Error('Bounded ordinary package archive required');
  return readFileSync(path);
 }
 if(original.protocol!=='https:' || original.port)throw new Error('Locked artifact requires HTTPS');
 const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),60000);
 const read=async(input,limit,authorize=false,asset=true)=>{
  let url=new URL(input);
  for(let hop=0;hop<6;hop++) {
   const headers={Accept:asset?'application/octet-stream':'application/vnd.github+json'};
   if(authorize && token)headers.Authorization='Bearer '+token;
   const response=await transport(url,{headers,redirect:'manual',signal:controller.signal});
   if([301,302,303,307,308].includes(response.status)) {
    await response.body?.cancel();const location=response.headers.get('location');if(!location)throw new Error('Artifact redirect lacks location');
    const next=new URL(location,url);
    if(next.protocol!=='https:' || next.port || next.username || next.password)throw new Error('Unsafe artifact redirect');
    authorize=false;url=next;continue;
   }
   if(!response.ok){await response.body?.cancel();throw new Error('Artifact HTTP status '+response.status);}
   const length=response.headers.get('content-length');
   if(length!==null && (!/^\d+$/.test(length) || Number(length)>limit)){await response.body?.cancel();throw new Error('Artifact response exceeds limit');}
   const reader=response.body?.getReader();if(!reader)throw new Error('Artifact response body missing');
   const chunks=[];let size=0;
   try{while(true){const item=await reader.read();if(item.done)break;size+=item.value.length;if(size>limit)throw new Error('Artifact response exceeds limit');chunks.push(item.value);}}
   finally{await reader.cancel();reader.releaseLock();}
   return Buffer.concat(chunks,size);
  }
  throw new Error('Artifact redirect limit exceeded');
 };
 try {
  const github=/^https:\/\/github\.com\/([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+)\/releases\/download\/([^/]+)\/([^/]+\.tgz)$/.exec(location);
  if(github && token) {
   const api=`https://api.github.com/repos/${github[1]}/${github[2]}`;
   const release=JSON.parse((await read(`${api}/releases/tags/${github[3]}`,1024*1024,true,false)).toString('utf8'));
   const matches=release.assets?.filter(asset=>asset.name===decodeURIComponent(github[4]));
   if(!Array.isArray(matches) || matches.length!==1 || !Number.isSafeInteger(matches[0].id) || matches[0].id<1 ||
      matches[0].browser_download_url!==location)throw new Error('Locked GitHub asset identity differs');
   return await read(`${api}/releases/assets/${matches[0].id}`,32*1024*1024,true);
  }
  return await read(location,32*1024*1024);
 }catch(error){
  if(controller.signal.aborted)throw new Error('Bootstrap download deadline exceeded');
  // Fetch exceptions can include signed redirect URLs; report a bounded transport failure instead.
  if(error instanceof TypeError)throw new Error('Bootstrap artifact transport failed');
  throw error;
 }finally{clearTimeout(timer);}
}

/** Seed only the pinned package; its installer remains the sole activation authority. */
export async function bootstrapRuntime(args) {
 const {values}=parseArgs({args,strict:true,allowPositionals:false,options:{workspace:{type:'string'},archive:{type:'string'},'state-directory':{type:'string'}}});
 if(!values.workspace || !values['state-directory'])throw new Error('Workspace and external state directory required');
 if(process.env.HARNESS_AGENT_ANCESTRY || process.env.GOVERNANCE_PARENT_TASK || process.env.GOVERNANCE_PARENT_LOCK_DIGEST)
  throw new Error('Delegated workers cannot bootstrap a runtime');
 if(!/^24\.(?:1[6-9]|[2-9]\d|\d{3,})\.\d+$/.test(process.versions.node))throw new Error('Node >=24.16.0 <25 required');
 const workspace=realpathSync(values.workspace),state=resolve(values['state-directory']);
 if(state===workspace || state.startsWith(workspace+'/'))throw new Error('Bootstrap state must be outside the checkout');
 const lockPath=join(workspace,'config/governance/runtime.lock.yaml');
 if(realpathSync(lockPath)!==lockPath || !lstatSync(lockPath).isFile())throw new Error('Canonical tracked lock required');
 // Compiled runtime locks are emitted as JSON, which is also valid YAML. No package code runs before integrity verification.
 if(lstatSync(lockPath).size>1024*1024)throw new Error('Runtime lock exceeds limit');
 const lock=JSON.parse(readFileSync(lockPath,'utf8'));
 if(lock.schema_version!==2 || lock.package!=='@organta/project-governance' ||
    !/^sha512-[A-Za-z0-9+/]{86}==$/.test(lock.artifact?.integrity??''))throw new Error('Compiled JSON runtime lock required');
 const retained=join(state,'runtime.tgz');
 const location=values.archive?pathToFileURL(realpathSync(values.archive)).href:
  lstatSync(retained,{throwIfNoEntry:false})?pathToFileURL(retained).href:lock.artifact.url;
 const bytes=await readBootstrapArchive(location,{token:process.env.GH_TOKEN||process.env.GITHUB_TOKEN});
 const integrity='sha512-'+createHash('sha512').update(bytes).digest('base64');
 if(integrity!==lock.artifact.integrity)throw new Error('Bootstrap archive integrity differs from lock');
 if(realpathSync(dirname(state))!==dirname(state))throw new Error('Bootstrap state parent must be canonical');
 try{mkdirSync(state,{mode:0o700});}catch(error){if(error.code!=='EEXIST')throw error;}
 if(realpathSync(state)!==state)throw new Error('Bootstrap state cannot use aliases');
 const temporary=realpathSync(mkdtempSync(join(tmpdir(),'governance-bootstrap-')));
 try {
  const seed=join(temporary,'runtime.tgz');writeFileSync(seed,bytes,{flag:'wx',mode:0o400});
  execFileSync('npm',['install','--offline','--ignore-scripts','--no-audit','--no-fund','--omit=dev','--cache',join(temporary,'cache'),seed],
   {cwd:temporary,timeout:60000,maxBuffer:1024*1024,stdio:['ignore','pipe','pipe']});
  const packageRoot=join(temporary,'node_modules/@organta/project-governance');
  const manifest=JSON.parse(readFileSync(join(packageRoot,'package.json'),'utf8'));
  if(manifest.name!==lock.package || manifest.version!==lock.version)throw new Error('Bootstrap package identity differs');
  const load=name=>import(pathToFileURL(join(packageRoot,'dist/engine/src',name+'.js')).href);
  const {compiledRuntimeLock}=await load('runtime-lock');compiledRuntimeLock(lock);
  const {digest,durableJson}=await load('core');
  const {runtimeMigrationPlan}=await load('runtime-migration-plan');
  const {runtimeOperationCommand}=await load('runtime-operation-command');
  const savedPath=join(state,'bootstrap.json'),retainedArchive=join(state,'runtime.tgz');
  if(!lstatSync(savedPath,{throwIfNoEntry:false})) {
   const plan=runtimeMigrationPlan(workspace);
   const request={mode:'init',lockedCheckout:true,workspace,registry:join(state,'registry.sqlite'),archive:retainedArchive,lock,
    expectedRevision:0,inputs:plan.inputs,hostPlan:plan.hostPlan};
   publishOnce(retainedArchive,bytes,0o400);
   publishOnce(savedPath,JSON.stringify({plan,request})+'\n');
  }
  if(realpathSync(savedPath)!==savedPath || realpathSync(retainedArchive)!==retainedArchive)throw new Error('Bootstrap state cannot use aliases');
  const saved=JSON.parse(readFileSync(savedPath,'utf8'));
  if(saved.request.workspace!==workspace || digest(saved.request.lock)!==digest(lock) || saved.request.archive!==retainedArchive ||
     saved.request.registry!==join(state,'registry.sqlite') || saved.request.mode!=='init' || saved.request.lockedCheckout!==true)
   throw new Error('Bootstrap scope changed');
  if('sha512-'+createHash('sha512').update(readFileSync(retainedArchive)).digest('base64')!==integrity)
   throw new Error('Retained bootstrap archive changed');
  const planPath=join(state,'plan.json'),requestPath=join(state,'request.json');
  durableJson(planPath,saved.plan);durableJson(requestPath,saved.request);
  return await runtimeOperationCommand('init',['--request-file',requestPath,'--project-plan',planPath,'--operation-directory',join(state,'installation')]);
 }finally{rmSync(temporary,{recursive:true,force:true});}
}
if(process.argv[1] && import.meta.url===pathToFileURL(realpathSync(process.argv[1])).href) {
 try{console.log(JSON.stringify(await bootstrapRuntime(process.argv.slice(2))));}
 catch(error){console.error(error instanceof Error?error.message:String(error));process.exitCode=1;}
}
