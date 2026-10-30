// W3C transport for a real tauri-driver session. Never invokes app IPC directly.
import {writeFile} from 'node:fs/promises';
const KEY = 'element-6066-11e4-a52e-4f735466cecf';
export class FatalUiError extends Error {}
export async function until(label, action, timeout = 60000) {
  const start = Date.now(); let last;
  while (Date.now() - start < timeout) {
    try { const value = await action(); if (value) return value; }
    catch (error) { if (error instanceof FatalUiError) throw error; last = error; }
    await new Promise(resolve => setTimeout(resolve, 250));
  }
  throw Error(`Timeout: ${label}: ${last ?? 'not ready'}`);
}
export class DesktopDriver {
  constructor(endpoint = 'http://127.0.0.1:4444') { this.endpoint = endpoint; this.session = null; }
  async request(method, route, body) {
    const response = await fetch(this.endpoint + route, {
      method, headers: {'content-type':'application/json'}, signal: AbortSignal.timeout(90000),
      ...(body === undefined ? {} : {body:JSON.stringify(body)})
    });
    const payload = await response.json();
    if (!response.ok || payload.value?.error) throw Error(`${method} ${route}: ${payload.value?.message ?? response.status}`);
    return payload.value;
  }
  async start(application) {
    if (this.session) throw Error('Previous native session must close first');
    const result = await this.request('POST', '/session', {
      capabilities:{alwaysMatch:{browserName:'wry', 'tauri:options':{application}}}
    });
    if (!result.sessionId) throw Error('No real Tauri WebDriver session');
    this.session = result.sessionId;
    await this.request('POST', this.route('/timeouts'), {implicit:0, pageLoad:90000, script:30000});
  }
  route(tail) { if (!this.session) throw Error('No native session'); return `/session/${this.session}${tail}`; }
  async close() {
    if (!this.session) return;
    await this.request('DELETE', this.route(''));
    this.session = null;
  }
  async element(selector) {
    const value = await this.request('POST', this.route('/element'), {using:'css selector',value:selector});
    if (!value[KEY]) throw Error(`Missing native element: ${selector}`);
    return value[KEY];
  }
  async elements(selector) {
    return this.request('POST', this.route('/elements'), {using:'css selector',value:selector});
  }
  async property(selector, name) {
    return this.request('GET', this.route(`/element/${await this.element(selector)}/property/${name}`));
  }
  async text(selector) {
    return this.request('GET', this.route(`/element/${await this.element(selector)}/text`));
  }
  async click(selector) {
    await until(`enabled ${selector}`, async () => !await this.property(selector, 'disabled'));
    await this.request('POST', this.route(`/element/${await this.element(selector)}/click`), {});
  }
  async keys(selector, value) {
    await this.request('POST', this.route(`/element/${await this.element(selector)}/value`), {text:value,value:Array.from(value)});
  }
  async fill(selector, value) {
    const id = await this.element(selector);
    await this.request('POST', this.route(`/element/${id}/clear`), {});
    await this.keys(selector, String(value));
  }
  async screenshot(file) {
    const data = await this.request('GET', this.route('/screenshot'));
    await writeFile(file, Buffer.from(data,'base64'));
  }
  async source() { return this.request('GET', this.route('/source')); }
}
