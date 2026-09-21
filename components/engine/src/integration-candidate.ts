import { digest, object, text } from './core.ts';

export interface IntegrationCandidate {
  repository: string; targetBranch: string; headSha: string; baseSha: string;
  candidateSha: string; proofPlanDigest: string; policyDigest: string;
}
const fields = ['repository', 'targetBranch', 'headSha', 'baseSha', 'candidateSha', 'proofPlanDigest', 'policyDigest'];
/** Observed refs come from the trusted controller, never from candidate-produced evidence. */
export function integrationCandidate(value: unknown, observed: IntegrationCandidate): Readonly<IntegrationCandidate> {
  const item = object(value, 'integration candidate');
  if (Object.keys(item).length !== fields.length || fields.some(key => !Object.hasOwn(item, key))) throw new Error('Invalid integration candidate fields');
  for (const key of fields) {
    text(item[key], key, 2048);
    if (item[key] !== observed[key as keyof IntegrationCandidate]) throw new Error('Stale or foreign integration candidate');
  }
  for (const key of ['headSha', 'baseSha', 'candidateSha'])
    if (!/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/u.test(String(item[key]))) throw new Error('Full candidate commit identities required');
  for (const key of ['proofPlanDigest', 'policyDigest'])
    if (!/^sha256:[a-f0-9]{64}$/u.test(String(item[key]))) throw new Error('Candidate plan and policy digests required');
  return Object.freeze({ ...item }) as unknown as Readonly<IntegrationCandidate>;
}
export interface ExecutionProfile {
  id: string; placement: 'local' | 'vm' | 'hosted'; qualified: boolean;
  available: boolean; candidateCanAccessPublisherCredential: boolean;
}
/** Admission is a pure gate; existing resource owners still acquire capacity and supervise workers. */
export function admitCiProfile(profile: ExecutionProfile | null): { state: 'ready' | 'blocked'; reason: string } {
  if (!profile || !profile.available) return { state: 'blocked', reason: 'missing-capacity' };
  if (!profile.id.trim() || !['local', 'vm', 'hosted'].includes(profile.placement) || profile.qualified !== true)
    return { state: 'blocked', reason: 'unqualified-profile' };
  if (profile.candidateCanAccessPublisherCredential !== false) return { state: 'blocked', reason: 'publisher-credential-reachable' };
  return { state: 'ready', reason: 'qualified-capacity' };
}
export interface PublicationRequest {
  candidate: Readonly<IntegrationCandidate>; claims: string[]; evidenceDigest: string; producerIdentity: string;
}
export interface PublicationObservation {
  requestDigest: string; state: 'unknown' | 'published' | 'rejected'; readbackIdentity: string | null;
}
export interface ResultPublisher {
  publish(request: PublicationRequest): Promise<PublicationObservation>;
  observePublication(requestDigest: string): Promise<PublicationObservation>;
}
/** Producer trust is supplied by an independent verifier of the exact candidate/evidence binding. */
export function resultPublication(value: unknown, observed: IntegrationCandidate,
  verifyProducer: (request: Readonly<PublicationRequest>) => boolean): Readonly<PublicationRequest> {
  const item = object(value, 'publication request');
  if (Object.keys(item).length !== 4 || !['candidate', 'claims', 'evidenceDigest', 'producerIdentity'].every(key => Object.hasOwn(item, key))) throw new Error('Invalid publication request fields');
  const candidate = integrationCandidate(item.candidate, observed);
  if (!Array.isArray(item.claims) || item.claims.length < 1 || item.claims.length > 128) throw new Error('Bounded publication claims required');
  const claims = item.claims.map(value => text(value, 'claim', 2048));
  if (new Set(claims).size !== claims.length || typeof item.evidenceDigest !== 'string' || !/^sha256:[a-f0-9]{64}$/u.test(item.evidenceDigest)) throw new Error('Invalid publication evidence');
  const request = { candidate, claims, evidenceDigest: item.evidenceDigest, producerIdentity: text(item.producerIdentity, 'producer identity', 256) };
  Object.freeze(claims); Object.freeze(request);
  if (!verifyProducer(request)) throw new Error('Untrusted or unbound producer evidence');
  return request;
}
/** Lost worker/reply requires observation, never an inferred successful check or automatic resubmission. */
export function publicationDisposition(request: Readonly<PublicationRequest>, value: unknown | null) {
  const requestDigest = digest(request);
  if (value === null) return { requestDigest, action: 'observe-existing' as const };
  const item = object(value, 'publication observation');
  if (Object.keys(item).length !== 3 || item.requestDigest !== requestDigest ||
      !['unknown', 'published', 'rejected'].includes(String(item.state)) ||
      (item.readbackIdentity !== null && (typeof item.readbackIdentity !== 'string' || !item.readbackIdentity.trim()))) throw new Error('Invalid publication observation');
  if (item.state === 'published' && item.readbackIdentity === null) throw new Error('Published result requires independent readback identity');
  return { requestDigest, action: item.state === 'unknown' ? 'observe-existing' as const : item.state === 'published' ? 'accept-readback' as const : 'retain-rejection' as const };
}
