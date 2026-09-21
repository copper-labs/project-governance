import type {StartupMetadata} from "./startup-metadata-cache.ts";
/** One discovery deadline covers every page, asset and redirect. Credentials never cross authorities. */
export class StartupHttp {
  readonly api:string;
  readonly #deadline:number;
  readonly #token:string|undefined;
  readonly #fetch:typeof fetch;
  readonly #metadata:StartupMetadata|undefined;
  constructor(owner:string,seconds:number,options:{token?:string;fetch?:typeof fetch;metadata?:StartupMetadata}={}) {
    if(!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/u.test(owner) || !Number.isFinite(seconds) || seconds<=0 || seconds>60)
      throw new Error("Invalid startup HTTP scope or budget");
    this.api=`https://api.github.com/repos/${owner}`;this.#metadata=options.metadata;
    this.#deadline=performance.now()+seconds*1000;this.#token=options.token;this.#fetch=options.fetch??fetch;
  }
  async read(input:string,limit=1024*1024,asset=false):Promise<Uint8Array> {
    const original=new URL(input);
    if(!Number.isSafeInteger(limit) || limit<1 || limit>16*1024*1024 || !input.startsWith(this.api+"/") || original.username || original.password || original.hash)
      throw new Error("Invalid startup resource scope or limit");
    const remaining=this.#deadline-performance.now();
    if(remaining<=0)throw new Error("Startup discovery deadline expired");
    const key=JSON.stringify([input,limit,asset]);
    if(this.#metadata?.replay) {
      const encoded=this.#metadata.replay[key];
      if(typeof encoded!=="string")throw new Error("Incomplete startup metadata cache");
      const bytes=Buffer.from(encoded,"base64");
      if(bytes.length>limit || bytes.toString("base64")!==encoded)throw new Error("Invalid startup metadata cache bytes");
      return bytes;
    }
    const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),Math.ceil(remaining));
    let url=original,authorize=true;
    try {
      for(let hop=0;hop<=5;hop++) {
        const headers:Record<string,string>={Accept:asset?"application/octet-stream":"application/vnd.github+json","User-Agent":"project-governance-startup"};
        if(authorize && this.#token)headers.Authorization=`Bearer ${this.#token}`;
        const response=await this.#fetch(url,{headers,redirect:"manual",signal:controller.signal});
        if([301,302,303,307,308].includes(response.status)) {
          await response.body?.cancel();
          const location=response.headers.get("location");if(!location)throw new Error("Startup redirect lacks location");
          const next=new URL(location,url);
          if(next.protocol!=="https:" || next.port || next.username || next.password || !["api.github.com","github.com","release-assets.githubusercontent.com","objects.githubusercontent.com"].includes(next.hostname))
            throw new Error("Unsupported startup redirect");
          authorize=authorize && next.origin===url.origin;url=next;continue;
        }
        if(!response.ok){await response.body?.cancel();throw new Error(`Startup HTTP status ${response.status}`);}
        const length=response.headers.get("content-length");
        if(length!==null && (!/^\d+$/u.test(length) || Number(length)>limit)){await response.body?.cancel();throw new Error("Startup response exceeds byte limit");}
        const reader=response.body?.getReader();if(!reader)throw new Error("Startup response body missing");
        const chunks:Uint8Array[]=[];let bytes=0;
        try {
          while(true){const item=await reader.read();if(item.done)break;bytes+=item.value.byteLength;if(bytes>limit)throw new Error("Startup response exceeds byte limit");chunks.push(item.value);}
        }finally{await reader.cancel();reader.releaseLock();}
        const result=Buffer.concat(chunks,bytes);
        if(this.#metadata)this.#metadata.record[key]=result.toString("base64");
        return result;
      }
      throw new Error("Startup redirect limit exceeded");
    }finally{clearTimeout(timer);}
  }
  async json(url:string) {return JSON.parse(new TextDecoder("utf-8",{fatal:true}).decode(await this.read(url)));}
}
