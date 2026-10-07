/* CDP 测试驱动：连接 WebView2 调试端口，提供求值/点击/填值/截图能力 */
const fs = require('node:fs');

class Cdp {
  constructor(url) {
    this.url = url;
    this.id = 0;
    this.pending = new Map();
    this.consoleLogs = [];
    this.exceptions = [];
    this.ws = null;
  }

  static async connect(port = 9223, timeoutMs = 60000) {
    // 轮询等 target 出现
    const start = Date.now();
    let url = null;
    while (Date.now() - start < timeoutMs) {
      try {
        const res = await fetch(`http://127.0.0.1:${port}/json/list`);
        const targets = await res.json();
        const page = targets.find((t) => t.type === 'page' && t.webSocketDebuggerUrl);
        if (page) {
          url = page.webSocketDebuggerUrl;
          break;
        }
      } catch {}
      await new Promise((r) => setTimeout(r, 1000));
    }
    if (!url) throw new Error('CDP target not found');
    const cdp = new Cdp(url);
    await cdp._open();
    return cdp;
  }

  _open() {
    return new Promise((resolve, reject) => {
      this.ws = new WebSocket(this.url);
      this.ws.onerror = () => reject(new Error('ws error'));
      this.ws.onopen = () => resolve();
      this.ws.onmessage = (ev) => {
        const msg = JSON.parse(ev.data);
        if (msg.id && this.pending.has(msg.id)) {
          const p = this.pending.get(msg.id);
          this.pending.delete(msg.id);
          msg.error ? p.reject(new Error(JSON.stringify(msg.error))) : p.resolve(msg.result);
        } else if (msg.method === 'Runtime.consoleAPICalled') {
          const args = (msg.params.args || []).map((a) => a.value ?? a.description ?? '').join(' ');
          this.consoleLogs.push(`[${msg.params.type}] ${args}`.slice(0, 250));
        } else if (msg.method === 'Runtime.exceptionThrown') {
          this.exceptions.push(JSON.stringify(msg.params.exceptionDetails).slice(0, 400));
        }
      };
    });
  }

  send(method, params = {}, timeoutMs = 60000) {
    return new Promise((resolve, reject) => {
      const msgId = ++this.id;
      this.pending.set(msgId, { resolve, reject });
      this.ws.send(JSON.stringify({ id: msgId, method, params }));
      setTimeout(() => {
        if (this.pending.has(msgId)) {
          this.pending.delete(msgId);
          reject(new Error('timeout ' + method));
        }
      }, timeoutMs);
    });
  }

  /** 页面内求值（异常转成 reject），返回原值 */
  async evalJs(expr, timeoutMs = 60000) {
    const r = await this.send(
      'Runtime.evaluate',
      { expression: expr, awaitPromise: true, returnByValue: true },
      timeoutMs
    );
    if (r.exceptionDetails) {
      throw new Error('PAGE THROW: ' + JSON.stringify(r.exceptionDetails.exception?.description || r.exceptionDetails).slice(0, 300));
    }
    return r.result.value;
  }

  /** 页面内 async 函数体求值，页内 try/catch 把错误作为 {ok:false} 返回 */
  async evalAsync(body, timeoutMs = 60000) {
    const expr = `(async () => { try { return JSON.stringify({ ok: true, value: await (${body}) }); } catch (e) { return JSON.stringify({ ok: false, error: String(e && e.message || e) }); } })()`;
    const raw = await this.evalJs(expr, timeoutMs);
    const parsed = JSON.parse(raw);
    if (!parsed.ok) throw new Error('PAGE THROW: ' + parsed.error);
    return parsed.value;
  }

  /** 点击第一个匹配文本的按钮 */
  async clickText(match, exact = false) {
    const r = await this.evalJs(`(() => {
      const b = [...document.querySelectorAll('button')].find(x => ${exact ? `x.textContent.trim() === ${JSON.stringify(match)}` : `x.textContent.includes(${JSON.stringify(match)})`});
      if (!b) return false;
      b.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
      return true;
    })()`);
    if (!r) throw new Error(`button not found: ${match}`);
    return true;
  }

  async clickSelector(selector) {
    const r = await this.evalJs(`(() => { const el = document.querySelector(${JSON.stringify(selector)}); if (!el) return false; el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true })); return true; })()`);
    if (!r) throw new Error(`selector not found: ${selector}`);
  }

  /** 按 placeholder 前缀填输入框 */
  async fillInput(placeholderPrefix, value) {
    const r = await this.evalJs(`(() => {
      const el = [...document.querySelectorAll('input')].find(i => (i.placeholder || '').startsWith(${JSON.stringify(placeholderPrefix)}));
      if (!el) return 'NOT FOUND';
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
      setter.call(el, ${JSON.stringify(value)});
      el.dispatchEvent(new Event('input', { bubbles: true }));
      return 'OK';
    })()`);
    if (r !== 'OK') throw new Error(`input not found: ${placeholderPrefix} (${r})`);
  }

  async fillTextarea(placeholderPrefix, value) {
    const r = await this.evalJs(`(() => {
      const el = [...document.querySelectorAll('textarea')].find(i => (i.placeholder || '').startsWith(${JSON.stringify(placeholderPrefix)}));
      if (!el) return 'NOT FOUND';
      const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value').set;
      setter.call(el, ${JSON.stringify(value)});
      el.dispatchEvent(new Event('input', { bubbles: true }));
      return 'OK';
    })()`);
    if (r !== 'OK') throw new Error(`textarea not found: ${placeholderPrefix} (${r})`);
  }

  async screenshot(name) {
    const shot = await this.send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(name, Buffer.from(shot.data, 'base64'));
    return name;
  }

  async reload() {
    await this.send('Page.enable');
    await this.send('Page.reload', { ignoreCache: true });
  }

  sleep(ms) {
    return new Promise((r) => setTimeout(r, ms));
  }

  close() {
    try { this.ws.close(); } catch {}
  }
}

module.exports = { Cdp };
