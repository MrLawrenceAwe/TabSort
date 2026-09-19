import { chromium, expect, test } from '@playwright/test';
import { cpSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

// Run without a DevTools connection: Chromium on macOS crashes when discarding
// debugger-attached tabs. The test extension imports the real workspace module.
test('wakes five discarded pages and restores their groups without taking focus', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'tabsort-discard-test-'));
  let child;
  let timer;
  let resolveResult;
  let rejectResult;
  const result = new Promise((resolve, reject) => { resolveResult = resolve; rejectResult = reject; });
  const server = createServer((request, response) => {
    let body = '';
    request.on('data', chunk => { body += chunk; });
    request.on('end', () => {
      response.end('ok');
      try { resolveResult(JSON.parse(body)); } catch (error) { rejectResult(error); }
    });
  });
  try {
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const endpoint = `http://127.0.0.1:${server.address().port}/result`;
    for (const folder of ['background', 'shared', 'preparation']) cpSync(resolve(folder), join(directory, folder), { recursive: true });
    writeFileSync(join(directory, 'manifest.json'), JSON.stringify({
      manifest_version: 3, name: 'TabSort discard regression', version: '1.0',
      permissions: ['tabs', 'storage'], host_permissions: ['http://127.0.0.1/*'],
      background: { service_worker: 'runner.js', type: 'module' },
    }));
    writeFileSync(join(directory, 'runner.js'), `
      import { createPreparationWorkspace } from ${JSON.stringify('./background/auto-preparation/workspace.js')};
      chrome.runtime.onInstalled.addListener(() => run().then(
        result => fetch(${JSON.stringify(endpoint)}, {method:'POST', body:JSON.stringify(result)}),
        error => fetch(${JSON.stringify(endpoint)}, {method:'POST', body:JSON.stringify({error:error.stack})})
      ));
      async function run() {
        const source = await chrome.windows.create({url:'about:blank',focused:true});
        const activeId = source.tabs[0].id;
        const tabs = [];
        const waitLoaded = async id => {
          const deadline = Date.now() + 10000;
          while(Date.now() < deadline) {
            const tab = await chrome.tabs.get(id);
            if (!tab.discarded && tab.status === 'complete') return tab;
            await new Promise(resolve => setTimeout(resolve,50));
          }
          throw new Error('Tab did not wake: '+id);
        };
        for(let i=0;i<5;i++) tabs.push(await chrome.tabs.create({windowId:source.id,active:false,
          url:'data:text/html,<title>Sleeping '+i+'</title><p>Discard test</p>'}));
        await Promise.all(tabs.map(tab=>waitLoaded(tab.id)));
        const groupId = await chrome.tabs.group({tabIds:tabs.map(tab=>tab.id)});
        const original = [];
        for(const tab of tabs) original.push(await chrome.tabs.discard(tab.id));
        const workspace = createPreparationWorkspace();
        await workspace.create(source.id);
        const rounds = [];
        try {
          for(const tab of original) {
            await workspace.moveTabToPreparationWindow(tab.id,source.id);
            const awake = await waitLoaded(tab.id);
            await workspace.returnTab();
            const returned = await chrome.tabs.discard(tab.id);
            rounds.push({awake,returned,preparationFocused:(await chrome.windows.get(workspace.windowId)).focused});
          }
        } finally {await workspace.finishSession();}
        const after = await chrome.tabs.query({windowId:source.id});
        return {original,rounds,groupId,activeId,finalActiveId:after.find(tab=>tab.active).id,
          placeholders:after.filter(tab=>tab.url.includes('/placeholder.html')).length};
      }
    `);
    child = spawn(chromium.executablePath(), [
      // Match Playwright's test-browser launch on hosted Linux runners.
      '--no-sandbox',
      `--user-data-dir=${join(directory, 'profile')}`, '--no-first-run', '--no-default-browser-check',
      `--disable-extensions-except=${directory}`, `--load-extension=${directory}`, 'about:blank',
    ], { stdio: ['ignore', 'ignore', 'pipe'] });
    let browserErrors = '';
    child.stderr.on('data', chunk => { browserErrors = (browserErrors + chunk).slice(-8000); });
    child.once('error', rejectResult);
    child.once('exit', (code, signal) => rejectResult(new Error(
      `Test browser exited early: code=${code}, signal=${signal}\n${browserErrors}`
    )));
    const observed = await Promise.race([result, new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error('Discard regression timed out')), 20000);
    })]);
    expect(observed.error).toBeUndefined();
    expect(observed.original.every(tab => tab.discarded)).toBe(true);
    expect(observed.rounds).toHaveLength(5);
    for (const [i, round] of observed.rounds.entries()) {
      expect(round.awake.discarded).toBe(false);
      expect(round.awake.status).toBe('complete');
      expect(round.returned.discarded).toBe(true);
      expect(round.returned.index).toBe(observed.original[i].index);
      expect(round.returned.groupId).toBe(observed.groupId);
      expect(round.preparationFocused).toBe(false);
    }
    expect(observed.finalActiveId).toBe(observed.activeId);
    expect(observed.placeholders).toBe(0);
  } finally {
    clearTimeout(timer);
    if (child && child.exitCode == null && child.signalCode == null) {
      child.kill('SIGTERM');
      await new Promise(resolve => child.once('exit', resolve));
    }
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
    rmSync(directory, { recursive: true, force: true });
  }
});
