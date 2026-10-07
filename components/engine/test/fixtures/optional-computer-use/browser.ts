import { createServer, type Server } from "node:http";
import { randomUUID } from "node:crypto";
import { minimalDriverEnvironment, PilotFailure, type Point } from "./holo.ts";
import type { Driver, FrameState, ScriptAction } from "./runner.ts";

export type Scenario = "form" | "settings" | "canvas";
export type Fault = "good" | "missing-error" | "wrong-value" | "false-toast" | "clipped-label" | "overlay" | "reverts" | "missing-feedback";
interface Route { request(): { url(): string }; continue(): Promise<void>; abort(): Promise<void> }
interface Page {
  goto(url: string): Promise<unknown>; screenshot(options: Record<string, unknown>): Promise<Buffer>;
  evaluate<T>(fn: (() => T) | string): Promise<T>; reload(): Promise<unknown>;
  mouse: { click(x: number, y: number): Promise<void>; move(x: number, y: number): Promise<void>; wheel(x: number, y: number): Promise<void> };
  keyboard: { type(text: string): Promise<void> }; close(): Promise<void>;
  on(event: string, callback: (frame: { parentFrame(): unknown | null }) => void): void;
}
interface Context {
  route(pattern: string, handler: (route: Route) => Promise<void>): Promise<void>;
  routeWebSocket(pattern: string, handler: (socket: { close(): void }) => void): Promise<void>;
  on(event: string, handler: (page: Page) => void): void; newPage(): Promise<Page>; close(): Promise<void>;
}
interface Browser { newContext(options: Record<string, unknown>): Promise<Context>; close(): Promise<void> }
interface Playwright { chromium: { launch(options: Record<string, unknown>): Promise<Browser> } }
declare global { interface Window { __pilot: { generation: number; submits: number; validations: number; record: string | null; selected: boolean; target: string | null; feedback: boolean; focused: string | null } } }

/** A disposable fixture: hidden state is read by the host only, never inserted into screenshots or model requests. */
export function fixtureHtml(scenario: Scenario, fault: Fault): string {
  return `<!doctype html><meta charset="utf-8"><title>Synthetic browser fixture</title>
  <style>body{font:20px sans-serif;margin:0;background:#f5f5f5}h1{position:absolute;left:70px;top:20px;font-size:24px}
  button,input,label,output{position:absolute}button{height:45px;width:220px;font:18px sans-serif}input{font:18px sans-serif}
  #field{left:90px;top:120px;width:260px;height:36px}#submit{left:90px;top:185px}#error{left:90px;top:240px;font-size:12px;color:#900}
  #menu{left:90px;top:85px}#dialog{position:absolute;left:85px;top:145px;width:350px;height:190px;background:white;border:2px solid #222}
  #toggle{left:100px;top:35px;width:30px;height:30px}label{left:140px;top:40px}#save{left:85px;top:105px}
  #overlay{position:absolute;left:85px;top:145px;width:350px;height:190px;background:rgba(220,220,220,.35);z-index:2}
  #toast{position:absolute;left:90px;top:300px;color:#070}#feedback{left:100px;top:310px}canvas{position:absolute;left:80px;top:100px}</style>
  <h1>${scenario === "form" ? "Submit synthetic contact" : scenario === "settings" ? "Synthetic preferences" : "Synthetic canvas controls"}</h1>
  ${scenario === "form" ? '<input id="field" aria-label="Contact address"><button id="submit">Submit contact</button><output id="error"></output><div id="toast"></div>' :
    scenario === "settings" ? '<button id="menu">Open preferences</button><div id="dialog" hidden><input type="checkbox" id="toggle"><label>Enable reminders</label><button id="save">Save preferences</button></div><div id="toast"></div>' :
    '<canvas width="600" height="180"></canvas><output id="feedback"></output>'}
  <script>
  const fault=${JSON.stringify(fault)}, scenario=${JSON.stringify(scenario)};
  const s=window.__pilot={generation:0,submits:0,validations:0,record:null,selected:localStorage.getItem('selected')==='true',target:null,feedback:false,focused:null};
  const by=id=>document.getElementById(id);
  new MutationObserver(()=>s.generation++).observe(document.body,{subtree:true,childList:true,attributes:true,characterData:true});
  for(const event of ['resize','scroll'])addEventListener(event,()=>s.generation++);
  document.addEventListener('focusin',e=>s.focused=e.target.id||null);
  document.addEventListener('input',()=>s.generation++);
  if(scenario==='form')by('submit').onclick=()=>{
    if(!by('field').value){s.validations++;if(fault!=='missing-error')by('error').textContent='Address is required';return;}
    s.submits++;if(fault!=='false-toast')s.record=fault==='wrong-value'?'incorrect@example.test':by('field').value;
    by('toast').textContent='Contact saved';by('error').textContent='';
  };
  if(scenario==='settings'){
    by('menu').onclick=()=>{by('dialog').hidden=false;by('toggle').checked=s.selected;
      if(fault==='clipped-label')by('dialog').querySelector('label').style.cssText='width:12px;overflow:hidden;white-space:nowrap';
      if(fault==='overlay'){const overlay=document.createElement('div');overlay.id='overlay';document.body.append(overlay);}};
    by('toggle').onchange=()=>{s.selected=by('toggle').checked;s.generation++};
    by('save').onclick=()=>{localStorage.setItem('selected',String(fault==='reverts'?false:s.selected));by('toast').textContent='Preferences saved';};
  }
  if(scenario==='canvas'){
    const c=document.querySelector('canvas'),ctx=c.getContext('2d');
    for(const x of [20,320]){ctx.fillStyle='#2558a0';ctx.fillRect(x,20,200,90);ctx.fillStyle='white';ctx.font='22px sans-serif';ctx.fillText('Activate',x+45,70);}
    c.onclick=e=>{s.target=e.offsetX<300?'left':'right';s.feedback=fault!=='missing-feedback';
      if(s.feedback)by('feedback').textContent=(s.target==='right'?'Right':'Left')+' control activated';};
  }
  </script>`;
}

export class BrowserFixture implements Driver {
  readonly session = randomUUID(); blockedRequests = 0; loseNextAck = false;
  private navigation = 0;
  readonly origin: string; readonly scenario: Scenario; readonly fault: Fault; readonly page: Page;
  private readonly server: Server; private readonly context: Context; private readonly browser: Browser;
  private constructor(origin: string, scenario: Scenario, fault: Fault, page: Page, server: Server, context: Context, browser: Browser) {
    this.origin = origin; this.scenario = scenario; this.fault = fault; this.page = page;
    this.server = server; this.context = context; this.browser = browser;
  }
  static async open(options: { modulePath: string; executablePath: string; scenario: Scenario; fault?: Fault; scale?: number; env?: NodeJS.ProcessEnv }) {
    const playwright = await import(options.modulePath) as Playwright;
    const fault = options.fault ?? "good", html = fixtureHtml(options.scenario, fault);
    const server = createServer((request, response) => {
      if (request.url !== "/") { response.writeHead(404); response.end(); return; }
      response.setHeader("Content-Type", "text/html; charset=utf-8");
      response.setHeader("Content-Security-Policy", "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; frame-src 'none'; form-action 'none'; base-uri 'none'");
      response.end(html);
    });
    await new Promise<void>((resolve, reject) => { server.once("error", reject); server.listen(0, "127.0.0.1", resolve); });
    const address = server.address(); if (!address || typeof address === "string") throw new PilotFailure("fixture-start-failed");
    const origin = `http://127.0.0.1:${address.port}`;
    let browser: Browser | undefined, context: Context | undefined;
    try {
      browser = await playwright.chromium.launch({ executablePath: options.executablePath, headless: true,
        env: minimalDriverEnvironment(options.env ?? process.env), args: ["--disable-background-networking", "--disable-component-update", "--disable-sync", "--no-first-run"] });
      context = await browser.newContext({ viewport: { width: 800, height: 600 }, deviceScaleFactor: options.scale ?? 1,
        serviceWorkers: "block", acceptDownloads: false, permissions: [], javaScriptEnabled: true });
      let blocked = 0;
      await context.route("**/*", async route => {
        const url = new URL(route.request().url());
        if (url.origin === origin && url.pathname === "/") await route.continue(); else { blocked++; await route.abort(); }
      });
      await context.routeWebSocket("**/*", socket => { blocked++; socket.close(); });
      const page = await context.newPage();
      context.on("page", other => { if (other !== page) { blocked++; void other.close(); } });
      await page.goto(origin + "/");
      const fixture = new BrowserFixture(origin, options.scenario, fault, page, server, context, browser);
      page.on("framenavigated", frame => { if (frame.parentFrame() === null) fixture.navigation++; });
      Object.defineProperty(fixture, "blockedRequests", { get: () => blocked });
      return fixture;
    } catch (error) { await context?.close(); await browser?.close(); await new Promise<void>(resolve => server.close(() => resolve())); throw error; }
  }
  async frame(): Promise<FrameState> {
    const state = await this.page.evaluate(() => ({ generation: window.__pilot.generation, width: innerWidth, height: innerHeight, scale: devicePixelRatio, origin: location.origin }));
    return { ...state, session: `${this.session}:${this.navigation}` };
  }
  screenshot() { return this.page.screenshot({ type: "png", fullPage: false, animations: "allow", caret: "initial" }); }
  async dispatch(action: ScriptAction, point: Point) {
    if (action.kind === "scroll") {
      await this.page.mouse.move(point.x, point.y); await this.page.mouse.wheel(0, action.deltaY);
      await this.page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
    }
    else { await this.page.mouse.click(point.x, point.y); if (action.kind === "type") await this.page.keyboard.type(action.text); }
    if (this.loseNextAck) { this.loseNextAck = false; throw new PilotFailure("acknowledgment-lost"); }
  }
  readback() { return this.page.evaluate(() => ({ ...window.__pilot, scrollY, field: (document.querySelector<HTMLInputElement>("#field")?.value ?? null), error: document.querySelector("#error")?.textContent ?? null, toast: document.querySelector("#toast")?.textContent ?? null })); }
  async reload() { await this.page.reload(); }
  async changedVisibleFixture() { await this.page.evaluate(() => { document.querySelector("h1")!.textContent = "Changed render generation"; }); }
  async makeScrollable() { await this.page.evaluate(() => { document.body.style.height = "1400px"; }); }
  async blockedNavigation() { try { await this.page.goto("http://127.0.0.1:1/"); } catch { /* Route admission rejects another local origin too. */ } }
  async close() { await this.context.close(); await this.browser.close(); await new Promise<void>(resolve => this.server.close(() => resolve())); }
}
