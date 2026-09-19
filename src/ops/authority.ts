import { realpathSync, existsSync } from "node:fs";
import { resolve, relative, isAbsolute, dirname } from "node:path";
import type { Operation, Task } from "../model/types.ts";

export interface AuthorityRequest {
  operation: Operation;
  /** Paths, systems and resources the Action may touch. */
  scope: string[];
  /** Where an effect lands when it leaves this machine. Never inferred. */
  destination: string | null;
  policyRevision: string;
  /** What the Action will actually touch, checked against scope before any effect. */
  targets: string[];
}

export interface Policy {
  revision: string;
  /** Operations this policy permits at all. Writing is absent by design. */
  allowedOperations: Operation[];
  /** Destinations permitted for a transmitting Action. */
  allowedDestinations: string[];
  /** Export rules: a target matching one of these may never be transmitted. */
  neverTransmit: RegExp[];
}

export type AuthorityVerdict =
  | { ok: true }
  | { ok: false; reason: string };

/**
 * Resolve a path fully before checking it, so an escape through `..` or a symlink is
 * refused rather than admitted by string comparison. A path that does not exist yet is
 * resolved through its nearest existing ancestor.
 */
export function resolveTarget(target: string, root: string): string {
  const absolute = isAbsolute(target) ? target : resolve(root, target);
  let probe = absolute;
  const suffix: string[] = [];
  while (!existsSync(probe) && dirname(probe) !== probe) {
    suffix.unshift(probe.slice(dirname(probe).length + 1));
    probe = dirname(probe);
  }
  const real = existsSync(probe) ? realpathSync(probe) : probe;
  return suffix.length ? resolve(real, ...suffix) : real;
}

export function withinScope(target: string, scope: string[], root: string): boolean {
  const resolved = resolveTarget(target, root);
  return scope.some((s) => {
    const base = resolveTarget(s, root);
    if (resolved === base) return true;
    const rel = relative(base, resolved);
    return rel !== "" && !rel.startsWith("..") && !isAbsolute(rel);
  });
}

/**
 * Authority is decided before any effect. Scope comes from the Task and policy; nothing a
 * worker selected into retrieved context can widen it.
 */
export function authorize(
  req: AuthorityRequest,
  policy: Policy,
  task: Task,
  root: string,
): AuthorityVerdict {
  if (policy.revision !== req.policyRevision) {
    return {
      ok: false,
      reason: `policy revision ${req.policyRevision} is stale; current is ${policy.revision}`,
    };
  }
  if (!policy.allowedOperations.includes(req.operation)) {
    return { ok: false, reason: `operation '${req.operation}' is not permitted by policy` };
  }
  if (task.status === "cancelled" || task.status === "accepted") {
    return { ok: false, reason: `task is ${task.status}` };
  }

  // A live prohibition in the Task is enforced here, not by wording alone.
  //
  // It applies to operations that mutate or leave the machine. `read`, `check` and `record`
  // do neither: a check runs a command the operator declared, and refusing to run the test
  // suite because the task said "without changing code" would be wrong. When a writing
  // operation exists it joins `transmit` on this list.
  const MUTATING: Operation[] = ["transmit"];
  const prohibition = task.items.find(
    (i) =>
      !i.revoked &&
      i.kind === "constraint" &&
      i.provenance === "operator" &&
      /\bdo not\b|\bnever\b|\bwithout (changing|modifying)\b|read[- ]only/i.test(i.body),
  );
  if (prohibition && MUTATING.includes(req.operation)) {
    return {
      ok: false,
      reason: `constraint forbids this: "${prohibition.body}"`,
    };
  }

  // Scope is declared by the Task, so an Action cannot claim scope the Task does not hold.
  const taskScope = task.items.filter((i) => !i.revoked && i.kind === "scope").map((i) => i.body);
  if (taskScope.length > 0) {
    const outside = req.scope.filter((s) => !withinScope(s, taskScope, root));
    if (outside.length) {
      return { ok: false, reason: `scope ${outside.join(", ")} exceeds the task's scope` };
    }
  }

  const escaped = req.targets.filter((t) => !withinScope(t, req.scope, root));
  if (escaped.length) {
    return { ok: false, reason: `target outside declared scope: ${escaped.join(", ")}` };
  }

  if (req.operation === "transmit") {
    if (!req.destination) {
      return { ok: false, reason: "transmit requires a declared destination" };
    }
    if (!policy.allowedDestinations.includes(req.destination)) {
      return { ok: false, reason: `destination '${req.destination}' is not permitted by policy` };
    }
    const blocked = req.targets.filter((t) => policy.neverTransmit.some((re) => re.test(t)));
    if (blocked.length) {
      return { ok: false, reason: `export rules forbid transmitting: ${blocked.join(", ")}` };
    }
  }

  return { ok: true };
}

/** The default policy. Writing to a working tree is absent because the host holds the pen. */
export function defaultPolicy(revision = "policy-1"): Policy {
  return {
    revision,
    allowedOperations: ["read", "check", "record", "transmit"],
    allowedDestinations: [],
    neverTransmit: [/\.env(\.|$)/i, /\bid_rsa\b/, /\bcredentials?\b/i, /\.pem$/i, /secrets?\.[a-z]+$/i],
  };
}
