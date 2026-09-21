import { execFile } from "node:child_process";

export interface ParserResult { code: number; stdout: string; stderr: string }
export type ParserRunner = (command: string, args: string[]) => Promise<ParserResult | null>;
/** Only absent executables are optional; deadlines, signals and output limits are infrastructure failures. */
export const runParser: ParserRunner = (command, args) => new Promise((resolve, reject) => {
  execFile(command, args, { encoding: "utf8", timeout: 30_000, killSignal: "SIGKILL", maxBuffer: 8 * 1024 * 1024,
    env: { PATH: process.env["PATH"] ?? "/usr/bin:/bin", HOME: process.env["HOME"] ?? "", LANG: "en_US.UTF-8" } }, (error, stdout, stderr) => {
    if (error && "code" in error && error.code === "ENOENT") return resolve(null);
    if (error && (error.killed || error.signal || typeof error.code !== "number")) return reject(new Error("Native parser execution failed"));
    resolve({ code: error?.code as number | undefined ?? 0, stdout, stderr });
  });
});
