'use strict';

/**
 * On-demand vault export (what the "Sync to Vault" button triggers).
 *
 * Reuses the same in-process export data the read endpoints already produce
 * (exportForVault + buildSummaryMarkdown), writes it to temp files, then runs
 * the git side under the vault's shared write lock: pull -> install -> commit as
 * Alfred -> push, reset-on-failure. The git dance lives in vault-commit.sh; here
 * we own only data generation and the flock wrapper.
 *
 * The lock (.git/alfred-write.lock) is the SAME file vault-sync and the vault
 * API use, bind-mounted so a container-side flock and a host-side flock contend
 * on one inode — that is the cross-process concurrency guard (nightly cron via
 * the same endpoint, vault-sync, etc.). An in-process guard in server.js stops
 * two simultaneous HTTP clicks before they even reach the lock.
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFile } = require('child_process');
const { promisify } = require('util');

const execFileAsync = promisify(execFile);
const { buildSummaryMarkdown } = require('../src/main/vaultSummary');

const VAULT_PATH = process.env.VAULT_PATH || '/vault';
const LOCK_TIMEOUT = process.env.VAULT_LOCK_TIMEOUT || '120';
const COMMIT_SCRIPT = path.join(__dirname, 'vault-commit.sh');
const LOCK_FILE = path.join(VAULT_PATH, '.git', 'alfred-write.lock');

/**
 * Regenerate + commit + push the vault export. Async so the git push (seconds,
 * network) never blocks the event loop — the board stays responsive and the
 * in-process busy guard in server.js can actually reject an overlapping call.
 * Resolves to a small result object; rejects with Error(git stderr) on failure.
 */
async function runVaultExport(db) {
  const data = db.exportForVault();
  const summary = buildSummaryMarkdown(data);

  const projects = data.projects.length;
  // Total cards across the board (matches /stats), for a human-friendly message.
  const cards = data.projects.reduce((n, p) => n + ((p.stats && p.stats.total_cards) || 0), 0);

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'kanban-export-'));
  const jsonTmp = path.join(tmpDir, 'kanban-export.json');
  const summaryTmp = path.join(tmpDir, 'kanban-summary.md');
  fs.writeFileSync(jsonTmp, JSON.stringify(data, null, 2), 'utf-8');
  fs.writeFileSync(summaryTmp, summary, 'utf-8');

  try {
    // flock holds the shared lock for the lifetime of vault-commit.sh. -w means
    // it waits up to LOCK_TIMEOUT for another writer, then fails (exit 1) rather
    // than blocking forever.
    const { stdout } = await execFileAsync(
      'flock',
      ['-w', String(LOCK_TIMEOUT), LOCK_FILE, 'bash', COMMIT_SCRIPT, jsonTmp, summaryTmp],
      { env: { ...process.env, VAULT_PATH } }
    );
    const committed = /COMMITTED/.test(stdout);
    return {
      status: committed ? 'committed' : 'nochange',
      committed,
      projects,
      cards,
      message: committed
        ? `Exported ${cards} cards across ${projects} projects to the vault.`
        : 'Vault already up to date — nothing to export.',
    };
  } catch (err) {
    // execFile rejects with .stderr / .code on non-zero exit (push/commit
    // failure, or a flock -w timeout meaning another writer held the lock).
    const detail = (err.stderr && String(err.stderr).trim()) || err.message;
    const timedOut = err.code === 1 && !detail;
    throw new Error(
      timedOut ? 'vault is busy (lock held) — try again shortly' : `vault export failed: ${detail}`
    );
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

module.exports = { runVaultExport };
