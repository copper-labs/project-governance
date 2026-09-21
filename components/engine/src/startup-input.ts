import type {Readable} from "node:stream";

/** Native hook payloads are small. Bound both bytes and waiting for a host to close its pipe. */
export async function startupInput(input:Readable=process.stdin,timeoutMs=3000):Promise<unknown> {
 if(!Number.isFinite(timeoutMs) || timeoutMs<=0)throw new Error("Invalid startup input deadline");
 return new Promise((resolve,reject)=>{
  const chunks:Buffer[]=[];let bytes=0;
  const finish=(error?:Error)=>{
   clearTimeout(timer);input.removeListener("data",data);input.removeListener("end",end);
   input.removeListener("error",failed);input.removeListener("close",closed);input.pause();
   if(error){reject(error);return;}
   try{resolve(JSON.parse(new TextDecoder("utf-8",{fatal:true}).decode(Buffer.concat(chunks))));}
   catch{reject(new Error("Malformed startup event input"));}
  };
  const data=(chunk:Buffer|string)=>{
   const value=Buffer.isBuffer(chunk)?chunk:Buffer.from(chunk);bytes+=value.length;
   if(bytes>65536){finish(new Error("Startup event input exceeds limit"));return;}
   chunks.push(value);
  };
  const end=()=>finish();
  const failed=()=>finish(new Error("Cannot read startup event input"));
  const closed=()=>finish(new Error("Startup event input closed before completion"));
  const timer=setTimeout(()=>finish(new Error("Startup event input deadline exceeded")),timeoutMs);
  input.on("data",data);input.once("end",end);input.once("error",failed);input.once("close",closed);
 });
}
