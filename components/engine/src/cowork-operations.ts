/** The coordinator reads this fixed effect before accepting private request bytes. */
export const COWORK_EFFECTS = {
  "register": "write", "projects": "read", "task-start": "write", "task-resume": "write",
  "task-show": "read", "task-checkpoint": "write", "context": "write", "skill-read": "read",
  "file-read": "read", "file-apply": "write", "check-start": "write", "check-status": "read",
  "check-output": "write", "check-cancel": "write", "commit": "write", "commit-status": "read",
} as const;
export type CoworkOperation = keyof typeof COWORK_EFFECTS;
export function coworkEffect(operation: string | undefined): "read" | "write" | null {
  return operation && Object.hasOwn(COWORK_EFFECTS, operation) ? COWORK_EFFECTS[operation as CoworkOperation] : null;
}
