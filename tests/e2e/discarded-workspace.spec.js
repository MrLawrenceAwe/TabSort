import { chromium, expect, test } from '@playwright/test';
import { cpSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

// Run without a DevTools connection: Chromium on macOS crashes when discarding
// debugger-attached tabs. The test extension imports the real workspace module.
test('wakes five discarded pages and restores their groups without taking focus', async () => {
  test.setTimeout(90_000);
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
    const runnerPath = 'tests/e2e/fixtures/discard-runner.js';
    writeFileSync(join(directory, 'manifest.json'), JSON.stringify({
      manifest_version: 3, name: 'TabSort discard regression', version: '1.0',
      permissions: ['tabs', 'storage'], host_permissions: ['http://127.0.0.1/*'],
      background: { service_worker: runnerPath, type: 'module' },
    }));
    mkdirSync(join(directory, 'tests/e2e/fixtures'), { recursive: true });
    cpSync(new URL('./fixtures/discard-runner.js', import.meta.url), join(directory, runnerPath));
    writeFileSync(join(directory, 'result-endpoint.json'), JSON.stringify({ endpoint }));
    child = spawn(chromium.executablePath(), [
      // Match Playwright's test-browser launch on hosted Linux runners.
      '--no-sandbox',
      '--disable-dev-shm-usage',
      // Keep the unfocused preparation window responsive on busy CI runners.
      '--disable-background-timer-throttling',
      '--disable-backgrounding-occluded-windows',
      '--disable-renderer-backgrounding',
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
      // Include browser startup and five sequential discard/wake/restore rounds.
      timer = setTimeout(() => reject(new Error(`Discard regression timed out\n${browserErrors}`)), 60000);
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
    // Chromium subprocesses can finish writing the profile after the main process exits.
    // Retry transient cleanup races, but still fail if the directory cannot be removed.
    rmSync(directory, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
  }
});
