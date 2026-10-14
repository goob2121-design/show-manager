import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import test from "node:test";
import ts from "typescript";

const require = createRequire(import.meta.url);
const source = name => readFileSync(new URL(name, import.meta.url), "utf8");
const compile = name => ts.transpileModule(source(name), { compilerOptions: {
  target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX,
} }).outputText;

// Standalone real components only: no app routes, credentials or database access.
test("rotated wedge renders, scrolls and cleans up in an isolated browser", { skip: !process.env.STAGEFLOW_TEST_PLAYWRIGHT }, async () => {
  const { chromium } = require(process.env.STAGEFLOW_TEST_PLAYWRIGHT);
  const modules = {};
  for (const [name, pkg, file] of [
    ["react", "react", "react.production.js"], ["react/jsx-runtime", "react", "react-jsx-runtime.production.js"],
    ["react-dom", "react-dom", "react-dom.production.js"], ["react-dom/client", "react-dom", "react-dom-client.production.js"],
    ["scheduler", "scheduler", "scheduler.production.js"],
  ]) modules[name] = readFileSync(path.join(path.dirname(require.resolve(`${pkg}/package.json`)), "cjs", file), "utf8");
  for (const name of ["wedge-rotated-lyrics", "footswitch-smart-paging-display", "footswitch-lyric-paging",
    "footswitch-smart-paging-observers", "footswitch-smart-paging-samples", "enhanced-footswitch-scrolling"])
    modules[`./${name}`] = compile(`./${name}.${["wedge-rotated-lyrics", "footswitch-smart-paging-display"].includes(name) ? "tsx" : "ts"}`);
  let css = "";
  const cssRoot = new URL("../../.next/static/", import.meta.url);
  for (const file of readdirSync(cssRoot, { recursive: true })) if (file.endsWith(".css")) css += readFileSync(new URL(file.replaceAll("\\", "/"), cssRoot), "utf8");
  const bundle = `(() => { const process={env:{NODE_ENV:'production'}}; const modules={${Object.entries(modules).map(([name, code]) => `${JSON.stringify(name)}:function(require,module,exports){${code}\n}`).join(",")}};
    const cache={}; function require(name){ if(cache[name])return cache[name].exports; const module={exports:{}};cache[name]=module;modules[name](require,module,module.exports);return module.exports; }
    const React=require('react'), root=require('react-dom/client').createRoot(document.getElementById('root'));
    window.mount=(rotation, fullscreen=false, lyrics=window.lyrics)=>{ window.controller?.destroy(); window.latest=null;
      const config={sample:'realistic',preferredSize:56,lineSpacing:1.4,calibration:0,title:'Portrait Wedge',songId:'test',fullscreen};
      const View=rotation==='normal'?require('./footswitch-smart-paging-display').SmartLyricPagingDisplay:require('./wedge-rotated-lyrics').WedgeRotatedLyrics;
      root.render(React.createElement(View,{key:rotation+lyrics,rotation,config,lyricText:lyrics,onReturn:()=>root.render(React.createElement('p',null,'Setup')),onCalibrate:()=>root.render(React.createElement('p',null,'Setup')),onMeasurement:value=>window.latest=value}));
    };
    window.enablePedal=()=>{window.controller=require('./enhanced-footswitch-scrolling').createEnhancedFootswitchScrolling(window,document,{enabled:true,speed:350,inactivityMs:180});};
  })();`;
  const browser = await chromium.launch({ headless: true, ...(process.env.STAGEFLOW_TEST_BROWSER ? { executablePath: process.env.STAGEFLOW_TEST_BROWSER } : {}) });
  try {
    const page = await browser.newPage({ viewport: { width: 1024, height: 768 } });
    const errors = []; page.on("pageerror", error => errors.push(error.message));
    await page.setContent(`<style>${css}html,body{margin:0;background:#050505;font-family:Arial,sans-serif}</style><div id="root"></div>`);
    await page.addScriptTag({ content: bundle });
    const lyrics = Array.from({ length: 16 }, (_, section) => `VERSE ${section + 1}\n` + Array.from({ length: 10 }, (_, line) => `[G] Section ${section + 1}, line ${line + 1}: long lyrics wrap without losing words.`).join("\n")).join("\n\n");
    await page.evaluate(value => { window.lyrics = value; }, lyrics);
    for (const rotation of ["clockwise", "counterclockwise"]) {
      await page.evaluate(value => window.mount(value), rotation);
      await page.waitForFunction(() => window.latest?.pageCount > 3 && document.scrollingElement.scrollHeight > innerHeight);
      const geometry = await page.locator(`[data-wedge-rotation="${rotation}"]`).boundingBox();
      assert.equal(geometry.width, 1024); assert.equal(geometry.height, 768);
      const rendered = await page.locator("[data-lyric-line]").allTextContents();
      assert.equal(rendered.join("").replaceAll("\n", ""), lyrics.replaceAll("\n", ""));
      await page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));
      await page.waitForFunction(() => window.latest?.visiblePage === 1);
      const first = await page.locator("[data-lyric-line]").first().boundingBox();
      assert.ok(first.x >= -1 && first.y >= -1 && first.x + first.width <= 1025 && first.y + first.height <= 769, "First lyric is inside the viewport");
      await page.keyboard.press("ArrowDown"); await page.waitForTimeout(150);
      assert.ok(await page.evaluate(() => scrollY > 0), "Native arrow scrolling still drives the document");
      await page.evaluate(() => { window.scrollTo({ top: 0, behavior: "instant" }); window.enablePedal(); });
      for (let i = 0; i < 5; i++) { await page.keyboard.press("ArrowDown"); await page.waitForTimeout(50); }
      await page.waitForTimeout(220);
      const stopped = await page.evaluate(() => scrollY);
      assert.ok(stopped > 30); await page.waitForTimeout(220);
      assert.equal(await page.evaluate(() => scrollY), stopped, "No runaway motion after release");
      await page.evaluate(() => window.scrollTo({ top: document.scrollingElement.scrollHeight, behavior: "instant" }));
      await page.waitForFunction(() => window.latest?.visiblePage === window.latest?.pageCount);
      const last = await page.locator("[data-lyric-line]").last().boundingBox();
      assert.ok(last.x >= -1 && last.y >= -1 && last.x + last.width <= 1025 && last.y + last.height <= 769, "Last lyric is inside the viewport");
      if (process.env.STAGEFLOW_WEDGE_SCREENSHOTS) await page.screenshot({ path: path.join(process.env.STAGEFLOW_WEDGE_SCREENSHOTS, `${rotation}.png`) });
      await page.setViewportSize({ width: 1280, height: 720 });
      await page.evaluate(value => window.mount(value, true), rotation);
      await page.waitForFunction(() => window.latest?.layout.viewportHeight === 1280);
      await page.evaluate(value => window.mount(value, true, 'NEXT SONG\nOnly the new lyrics'), rotation);
      await page.waitForFunction(() => window.latest?.pageCount === 1);
      assert.equal(await page.locator("[data-lyric-line]").count(), 2);
      await page.getByRole("button", { name: "Calibrate", exact: true }).click();
      await page.waitForFunction(() => !document.querySelector("[data-wedge-rotation]"));
      await page.setViewportSize({ width: 1024, height: 768 });
      await page.evaluate(() => window.mount('normal'));
      await page.waitForFunction(() => document.querySelector('[data-smart-lyric-page]') && !document.querySelector('[data-wedge-rotation]'));
      assert.equal(await page.getByRole("main").getAttribute("aria-label"), "Full-screen lyric test");
    }
    assert.deepEqual(errors, []);
    await page.close();
  } finally { await browser.close(); }
});
