/** One remaining budget shared across sequential work, resistant to clock rollback within a process. */
export class OperationDeadline {
 readonly #monotonicEnd:number;
 readonly expiresAt:number;
 constructor(expiresAt:number) {
  if(!Number.isSafeInteger(expiresAt) || expiresAt<1)throw new Error("Invalid operation deadline");
  this.expiresAt=expiresAt;
  this.#monotonicEnd=performance.now()+Math.max(0,expiresAt-Date.now());
 }
 remaining(maximum=3600000):number {
  if(!Number.isSafeInteger(maximum) || maximum<1)throw new Error("Invalid operation timeout ceiling");
  const value=Math.floor(Math.min(maximum,this.expiresAt-Date.now(),this.#monotonicEnd-performance.now()));
  if(value<1)throw new Error("Operation deadline expired; inspect retained evidence before continuing");
  return value;
 }
}
