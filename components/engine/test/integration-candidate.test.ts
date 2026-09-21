import test from 'node:test';
import assert from 'node:assert/strict';
import {digest} from '../src/core.ts';
import {integrationCandidate,admitCiProfile,resultPublication,publicationDisposition} from '../src/integration-candidate.ts';
const candidate = {repository:'repository-one',targetBranch:'beta',headSha:'a'.repeat(40),baseSha:'b'.repeat(40),candidateSha:'c'.repeat(40),proofPlanDigest:'sha256:'+'d'.repeat(64),policyDigest:'sha256:'+'e'.repeat(64)};
const raw=()=>({candidate,claims:['tests-pass'],evidenceDigest:'sha256:'+'f'.repeat(64),producerIdentity:'trusted-controller'});
const trusted=digest(raw());
const request=()=>resultPublication(raw(),candidate,value=>digest(value)===trusted);
test('CI evidence rejects stale head, base, integration commit, plan and foreign repository',()=>{
 assert.ok(Object.isFrozen(integrationCandidate(candidate,candidate)));
 for(const key of ['headSha','baseSha','candidateSha','proofPlanDigest','policyDigest','repository','targetBranch'])assert.throws(()=>integrationCandidate({...candidate,[key]:'changed'},candidate),/Stale/);
});
test('missing CI capacity remains blocked across local, VM and hosted placements',()=>{
 assert.equal(admitCiProfile(null).state,'blocked');
 for(const placement of ['local','vm','hosted'] as const)assert.equal(admitCiProfile({id:'fixture',placement,qualified:true,available:false,candidateCanAccessPublisherCredential:false}).reason,'missing-capacity');
});
test('worker loss keeps the existing publication identity unresolved',()=>{
 const value=request();assert.deepEqual(publicationDisposition(value,null),{requestDigest:digest(value),action:'observe-existing'});
});
test('producer identity alone cannot authorize altered evidence or claims',()=>{
 for(const change of [{evidenceDigest:'sha256:'+'a'.repeat(64)},{claims:['different']},{producerIdentity:'untrusted'}])assert.throws(()=>resultPublication({...raw(),...change},candidate,value=>digest(value)===trusted),/Untrusted/);
});
test('candidate credential reachability or an unqualified profile blocks publication placement',()=>{
 const profile={id:'isolated',placement:'vm' as const,qualified:true,available:true,candidateCanAccessPublisherCredential:false};
 assert.equal(admitCiProfile(profile).state,'ready');
 assert.equal(admitCiProfile({...profile,candidateCanAccessPublisherCredential:true}).reason,'publisher-credential-reachable');
 assert.equal(admitCiProfile({...profile,qualified:false}).state,'blocked');
});
test('publication recovery requires matching independent readback rather than retrying lost replies',()=>{
 const value=request(),requestDigest=digest(value);
 assert.equal(publicationDisposition(value,{requestDigest,state:'unknown',readbackIdentity:null}).action,'observe-existing');
 assert.throws(()=>publicationDisposition(value,{requestDigest,state:'published',readbackIdentity:null}),/readback/);
 assert.throws(()=>publicationDisposition(value,{requestDigest:'wrong',state:'published',readbackIdentity:'check-1'}),/Invalid/);
 assert.equal(publicationDisposition(value,{requestDigest,state:'published',readbackIdentity:'check-1'}).action,'accept-readback');
});
