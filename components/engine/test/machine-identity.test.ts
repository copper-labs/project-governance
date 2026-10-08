import {test} from "node:test";
import assert from "node:assert/strict";
import {readMachineIdentity,sameMachineIdentity,validMachineIdentity} from "../src/machine-identity.ts";
const uuid="12345678-1234-5678-9abc-123456789abc", machineId="machine:sha256:"+"a".repeat(64);
const deny=()=>{throw new Error("private command error");};
test("machine identity uses documented local sources, hashes raw IDs, and normalizes case",()=>{
 const mac=readMachineIdentity("darwin",{read:deny,run:(command,args)=>{
  assert.equal(command,"/usr/sbin/ioreg");assert.deepEqual(args,["-rd1","-c","IOPlatformExpertDevice"]);
  return '"IOPlatformUUID" = "'+uuid+'"';
 }});
 assert.ok(validMachineIdentity(mac));assert.ok(!mac.includes(uuid));
 assert.equal(mac,readMachineIdentity("darwin",{read:deny,run:()=> '"IOPlatformUUID" = "'+uuid.toUpperCase()+'"'}));
 const linux=readMachineIdentity("linux",{run:deny,read:path=>{assert.equal(path,"/etc/machine-id");return "a".repeat(32)+"\n";}});
 assert.ok(validMachineIdentity(linux));assert.notEqual(linux,mac);
 const windows=readMachineIdentity("win32",{read:deny,run:(command,args)=>{
  assert.equal(command,"C:\\Windows\\System32\\reg.exe");assert.deepEqual(args,["query","HKLM\\SOFTWARE\\Microsoft\\Cryptography","/v","MachineGuid"]);
  return "MachineGuid REG_SZ "+uuid;
 }});
 assert.ok(validMachineIdentity(windows));assert.notEqual(windows,mac);
});
test("unavailable or malformed machine evidence grants no stable identity and leaks no error",()=>{
 for(const platform of ["darwin","linux","win32","unsupported"]) assert.equal(readMachineIdentity(platform,{read:deny,run:deny}),null);
 for(const id of ["", "0".repeat(32),"not-a-machine", "a".repeat(31)]) assert.equal(readMachineIdentity("linux",{run:deny,read:()=>id}),null);
 assert.equal(readMachineIdentity("darwin",{read:deny,run:()=> '\"IOPlatformUUID\" = \"00000000-0000-0000-0000-000000000000\"'}),null);
 const paths:string[]=[];
 assert.ok(validMachineIdentity(readMachineIdentity("linux",{run:deny,read:path=>{paths.push(path);if(path==="/etc/machine-id")return "uninitialized";return "b".repeat(32);}})));
 assert.deepEqual(paths,["/etc/machine-id","/var/lib/dbus/machine-id"]);
});
test("stable ownership tolerates renamed labels but refuses foreign or downgraded machine evidence",()=>{
 const old={host:"old-name",machineId},current={host:"new-name.local",machineId};
 assert.equal(sameMachineIdentity(old,current),true);
 for(const observed of [{host:"old-name"},{...current,machineId:"machine:sha256:"+"b".repeat(64)},{...current,machineId:"invalid"}]) assert.equal(sameMachineIdentity(old,observed),false);
 assert.equal(sameMachineIdentity({...old,machineId:"invalid"},{...current,machineId:"invalid"}),false);
});
test("legacy records retain their literal host guard and cannot be assigned an inferred machine",()=>{
 assert.equal(sameMachineIdentity({host:"old-name"},{host:"old-name",machineId}),true);
 assert.equal(sameMachineIdentity({host:"old-name"},{host:"new-name",machineId}),false);
 assert.equal(sameMachineIdentity({host:"old-name"},{host:"old-name",machineId:"invalid"}),false);
 assert.equal(sameMachineIdentity({},{host:"old-name",machineId}),false);
});
