import { object, text } from './core.ts';

export interface CapabilityDescriptor {
  id: string; contractVersion: 1; implementationDigest: string;
  engineMajor: 3; operations: string[];
}
export interface ExternalObservation {
  operationId: string;
  state: 'pending' | 'succeeded' | 'failed' | 'cancelled' | 'unknown';
  outstandingEffects: boolean;
}
export interface ExternalCapabilityProbe {
  descriptor: CapabilityDescriptor;
  observe(operationId: string): Promise<ExternalObservation>;
  requestCancel(operationId: string): Promise<void>;
}

/** Explicit registration only: this contract never loads plugins or authorizes external dispatch. */
export function capabilityDescriptor(value: unknown): CapabilityDescriptor {
  const item = object(value, 'capability');
  const keys = ['id', 'contractVersion', 'implementationDigest', 'engineMajor', 'operations'];
  if (Object.keys(item).length !== keys.length || keys.some(key => !Object.hasOwn(item, key))) throw new Error('Invalid capability fields');
  const id = text(item.id, 'capability id', 128);
  if (item.contractVersion !== 1 || item.engineMajor !== 3) throw new Error('Incompatible capability');
  if (typeof item.implementationDigest !== 'string' || !/^sha256:[a-f0-9]{64}$/u.test(item.implementationDigest)) throw new Error('Capability implementation identity required');
  if (!Array.isArray(item.operations) || item.operations.length < 1 || item.operations.length > 128) throw new Error('Bounded capability operations required');
  const operations = item.operations.map(value => text(value, 'capability operation', 128));
  if (new Set(operations).size !== operations.length) throw new Error('Duplicate capability operation');
  return { id, contractVersion: 1, implementationDigest: item.implementationDigest, engineMajor: 3, operations };
}

/** A lost reply stays unknown; cancellation acknowledgment alone cannot settle remote effects. */
export function externalObservation(value: unknown, operationId: string): ExternalObservation {
  const item = object(value, 'external observation');
  if (Object.keys(item).length !== 3 || item.operationId !== text(operationId, 'operation id', 256) ||
      !['pending', 'succeeded', 'failed', 'cancelled', 'unknown'].includes(String(item.state)) ||
      typeof item.outstandingEffects !== 'boolean') throw new Error('Invalid external observation identity or state');
  if (['succeeded', 'failed', 'cancelled'].includes(String(item.state)) && item.outstandingEffects) throw new Error('Outstanding effects prevent terminal settlement');
  return { operationId, state: item.state as ExternalObservation['state'], outstandingEffects: item.outstandingEffects };
}

export interface CapabilityGrant {
  authorityRef: string; implementationDigest: string; grantedOperations: readonly string[];
}

/** Absence is optional until an operation is requested; no fallback implementation is selected. */
export function requireCapability(value: unknown | null, operation: string): CapabilityDescriptor {
  if (value === null) throw new Error('Capability unavailable');
  const descriptor = capabilityDescriptor(value);
  if (!descriptor.operations.includes(text(operation, 'operation', 128))) throw new Error('Unsupported capability operation');
  return descriptor;
}

/** Compare against a trusted policy-owner grant; a descriptor or provider cannot grant authority. */
export function requireCapabilityAuthority(value: unknown | null, operation: string,
  requestedAuthorityRef: string, trustedGrant: CapabilityGrant | null): CapabilityDescriptor {
  const descriptor = requireCapability(value, operation);
  if (!trustedGrant || !requestedAuthorityRef.trim() || trustedGrant.authorityRef !== requestedAuthorityRef ||
      trustedGrant.implementationDigest !== descriptor.implementationDigest ||
      !trustedGrant.grantedOperations.includes(operation)) throw new Error('Capability authority rejected');
  return descriptor;
}
