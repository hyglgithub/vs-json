const fs = require("fs");
const http = require("http");
const { spawn } = require("child_process");
const WebSocket = require("C:/Users/31548/Desktop/JustPlay/pi/node_modules/ws");
const CHROME = "C:/Program Files/Google/Chrome/Application/chrome.exe";
const PORT = 9333;
function httpJson(path) { return new Promise(function (res, rej) { http.get({ host: "127.0.0.1", port: PORT, path: path }, function (r) { let b = ""; r.on("data", function (c) { b += c; }); r.on("end", function () { try { res(JSON.parse(b)); } catch (e) { rej(e); } }); }).on("error", rej); }); }
function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
(async function () {
  const tmp = "C:/Users/31548/AppData/Local/Temp/cdp-jsontool10";
  try { fs.rmSync(tmp, { recursive: true, force: true }); } catch (e) {}
  const child = spawn(CHROME, ["--headless=new", "--remote-debugging-port=" + PORT, "--user-data-dir=" + tmp, "--no-first-run", "--no-default-browser-check", "--disable-gpu", "--window-size=1400,900", "http://127.0.0.1:3112/"], { stdio: "ignore" });
  let list = null;
  for (let i = 0; i < 40; i++) { await sleep(500); try { list = await httpJson("/json/list"); if (list && list.length) break; } catch (e) {} }
  const page = (list || []).filter(function (t) { return t.type === "page"; })[0];
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  let id = 0; const pending = {};
  ws.on("message", function (m) { const j = JSON.parse(m); if (j.id && pending[j.id]) { pending[j.id](j); delete pending[j.id]; } });
  function send(method, params) { return new Promise(function (res) { const i = ++id; pending[i] = res; ws.send(JSON.stringify({ id: i, method: method, params: params || {} })); }); }
  await new Promise(function (res) { ws.on("open", res); });
  await send("Runtime.enable");
  async function ev(expr) { const r = await send("Runtime.evaluate", { expression: expr, returnByValue: true, awaitPromise: true }); if (r.result && r.result.exceptionDetails) return "ERR:" + r.result.exceptionDetails.text; return r.result && r.result.result ? r.result.result.value : null; }
  for (let i = 0; i < 30; i++) { const ok = await ev("!!document.querySelector('.actions')"); if (ok) break; await sleep(500); }
  // .actions 出现在服务端渲染的 HTML 里，此时 React 往往还没接管。必须等 hydration 完成再写入，
  // 否则值只进了 DOM、React 的 state 仍是空的，后续点击全部作用在空内容上，下一次渲染还会把文本抹掉。
  for (let i = 0; i < 60; i++) {
    const ok = await ev("(function(){ var el=document.querySelector('.editor-front'); if(!el) return false; return Object.keys(el).some(function(k){ return k.indexOf('__reactFiber$')===0 || k.indexOf('__reactProps$')===0; }); })()");
    if (ok) break;
    await sleep(250);
  }
  const input = String.fromCharCode(123,34,110,97,109,101,34,58,32,34) + String.fromCharCode(0x4e2d, 0x6587) + String.fromCharCode(34,44,32,34,98,34,58,32,91,49,44,50,93,125);
  // 先清空再写入：React 的 value tracker 会把 hydration 时已有的文本当成基线，直接写入相同内容不会触发 onChange。
  async function setValue(t) { const expr = "(function(){ var el=document.querySelector('.editor-front'); var d=Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype,'value'); d.set.call(el, ''); el.dispatchEvent(new Event('input',{bubbles:true})); d.set.call(el, " + JSON.stringify(t) + "); el.dispatchEvent(new Event('input',{bubbles:true})); return el.value; })()"; return await ev(expr); }
  await setValue(input);
  await sleep(400);
  async function raw() { return await ev("document.querySelector('.editor-front').value"); }
  async function clickText(t) { return await ev("(function(){ var els=Array.from(document.querySelectorAll('button')).filter(function(b){return b.textContent.trim()===" + JSON.stringify(t) + ";}); if(!els.length) return 'NOTFOUND'; els[0].click(); return 'ok'; })()"); }
  const BS = String.fromCharCode(92);
  const NL = String.fromCharCode(10);
  const DQ = String.fromCharCode(34);
  const lines = function (s) { return s.split(NL).length - 1; };

  const init = await raw();
  console.log("init    = " + JSON.stringify(init));
  console.log("clickFmt=" + await clickText("格式化")); await sleep(300);
  const formatted = await raw();
  console.log("format  = " + JSON.stringify(formatted));
  console.log("clickUni=" + await clickText("Unicode")); await sleep(250);
  console.log("clickZh =" + await clickText("中文转 Unicode")); await sleep(300);
  const unicode = await raw();
  console.log("unicode = " + JSON.stringify(unicode));
  await clickText("格式化"); await sleep(300);
  const fmt2 = await raw();
  console.log("fmt#2   = " + JSON.stringify(fmt2));
  await clickText("压缩"); await sleep(300);
  const minify = await raw();
  console.log("minify  = " + JSON.stringify(minify));
  await clickText("格式化"); await sleep(300);
  const beforeEsc = await raw();
  console.log("clickEsc=" + await clickText("转义")); await sleep(250);
  await clickText("添加 " + BS + " 转义"); await sleep(300);
  const escape = await raw();
  console.log("escape  = " + JSON.stringify(escape));

  const checks = [
    ["写入内容 React 收到了", init === input],
    ["格式化产生缩进换行", lines(formatted) > 0 && formatted.indexOf(NL + "  ") !== -1],
    ["中文转 Unicode 生效", unicode.indexOf(BS + "u4e2d") !== -1],
    ["压缩回到单行", lines(minify) === 0],
    ["转义保留换行，未破坏排版", lines(beforeEsc) > 0 && lines(escape) === lines(beforeEsc)],
    ["转义作用于引号", escape.indexOf(BS + DQ) !== -1],
  ];
  console.log("");
  let bad = 0;
  for (let i = 0; i < checks.length; i++) { if (!checks[i][1]) bad++; console.log("  " + (checks[i][1] ? "PASS" : "FAIL") + "  " + checks[i][0]); }
  console.log(bad ? "" + bad + " 项失败" : "全部通过");
  child.kill(); process.exit(bad ? 1 : 0);
})();