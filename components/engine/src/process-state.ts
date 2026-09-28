/** A zombie leader may still have live threads on Linux; only a fully exited group is absent. */
export function processHasExited(state: string): boolean {
  return state.startsWith("Z") && !state.includes("l");
}
