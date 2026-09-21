export interface CheckObservationContext {
  trigger?: "manual" | "hook" | "test";
  expectedStatus?: "passed" | "failed" | "warning" | "blocked";
}

/** Expectations label test observations; they never change execution or its exit status. */
export function checkObservationContext(trigger?: string, expectedStatus?: string): CheckObservationContext {
  if (trigger !== undefined && !["manual", "hook", "test"].includes(trigger)) throw new Error("Invalid check trigger");
  if (expectedStatus !== undefined && (trigger !== "test" || !["passed", "failed", "warning", "blocked"].includes(expectedStatus))) {
    throw new Error("Expected status requires a test trigger and a supported status");
  }
  return { ...(trigger === undefined ? {} : { trigger: trigger as NonNullable<CheckObservationContext["trigger"]> }),
    ...(expectedStatus === undefined ? {} : { expectedStatus: expectedStatus as NonNullable<CheckObservationContext["expectedStatus"]> }) };
}
