import {realpathSync} from "node:fs";
import {join} from "node:path";
import {fileURLToPath} from "node:url";
import {parseArgs} from "node:util";
import {createHash} from "node:crypto";
import {safeSubjectPath} from "./change-subject.ts";
import {narrativeFile} from "./narrative-inputs.ts";

/** Read the selected package's guidance, never a target-side copy or an arbitrary host path. */
export function skillReadCommand(args:string[],assetRoot=fileURLToPath(new URL("../assets/skills/",import.meta.url))) {
 const {values}=parseArgs({args,strict:true,allowPositionals:false,options:{path:{type:"string"}}});
 if(!values.path)throw new Error("Packaged skill path required");
 const path=safeSubjectPath(values.path);
 if(!/\.(?:md|yaml|json)$/u.test(path))throw new Error("Packaged guidance must be Markdown, YAML or JSON");
 const root=realpathSync(assetRoot),full=join(root,path);
 if(realpathSync(full)!==full)throw new Error("Packaged guidance cannot use aliases");
 const content=narrativeFile(root,path),bytes=Buffer.byteLength(content);
 if(bytes>65536)throw new Error("Packaged guidance exceeds 64 KiB read limit");
 return {version:1,authority:"selected-runtime-package",path,bytes,sourceDigest:`sha256:${createHash("sha256").update(content).digest("hex")}`,content};
}
