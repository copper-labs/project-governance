import { readdirSync } from "node:fs";
import { join } from "node:path";
import { parse } from "yaml";
import { narrativeFile } from "./narrative-inputs.ts";
import { object } from "./core.ts";

const retiredWheelCommand = /(?:\.governance[\\/]runtime[\\/](?:bin[\\/](?:python(?:\d+(?:\.\d+)*)?|harness-agent)|Scripts[\\/](?:python(?:\.exe)?|harness-agent(?:\.exe)?))|tools[\\/]governance-(?:bootstrap|startup)\.py)(?=$|[\s'";|&<>])/u;

/** The compiled package does not supply the wheel's Python environment to project-owned checks. */
export function assertNoWheelInterpreterDependency(workspace: string) {
  const directory = join(workspace, "config/validation/packs");
  let names: string[];
  try { names = readdirSync(directory); }
  catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") names=[]; else throw error; }
  const dependent: string[] = [];
  for (const name of names.filter(name => name.endsWith(".yaml")).sort()) {
    const pack = object(parse(narrativeFile(workspace, join(directory, name))));
    if (!Array.isArray(pack.commands)) throw new Error("Target pack commands must be declared before runtime transition");
    for (const raw of pack.commands) {
      const command = object(raw);
      const run = command.run;
      const argumentsText = typeof run === "string" ? run : Array.isArray(run) ? run.map(value => String(value)).join(" ") : "";
      if (retiredWheelCommand.test(argumentsText)) {
        dependent.push(typeof pack.id === "string" ? pack.id : name); break;
      }
    }
  }
  if (dependent.length) throw new Error(`Target checks still depend on retired wheel tooling: ${dependent.join(", ")}. Move Python checks to a project-owned interpreter and migrate legacy runtime commands before compiled runtime activation.`);
  const workflows=join(workspace,".github/workflows");
  let files:string[];
  try{files=readdirSync(workflows);}catch(error){if((error as NodeJS.ErrnoException).code==="ENOENT")return;throw error;}
  const legacy:string[]=[];
  for(const name of files.filter(name=>/\.ya?ml$/u.test(name)).sort()) {
    const workflow=object(parse(narrativeFile(workspace,join(workflows,name))));
    for(const [id,raw] of Object.entries(object(workflow.jobs,"workflow jobs"))) {
      const job=object(raw,"workflow job");
      if(job.steps===undefined)continue;
      if(!Array.isArray(job.steps))throw new Error("Workflow steps must be an array before runtime transition");
      for(const rawStep of job.steps) {
        const run=object(rawStep,"workflow step").run;
        if(typeof run==="string" && retiredWheelCommand.test(run))
          legacy.push(`${name}:${id}`);
      }
    }
  }
  if(legacy.length)throw new Error(`CI workflows still invoke retired wheel tooling: ${[...new Set(legacy)].join(", ")}. Migrate bootstrap and interpreter calls before compiled runtime activation.`);
}
