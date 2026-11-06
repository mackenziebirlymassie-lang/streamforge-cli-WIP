# StreamForge CLI Full System Overhaul & Hardening Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Elevate StreamForge CLI into an enterprise-grade, zero-dependency streaming build and automation tool by exposing all 14 automation modules via CLI & pipeline DAG, implementing parallel wave execution, hardening security and file I/O, fixing repository hygiene, and bringing test coverage across all previously untested modules to 100%.

**Architecture:** 
- Maintain strict zero-dependency philosophy (< 4ms startup, native ES6+).
- Leverage DAG topological level sorting to group independent stages into parallel concurrent waves via `Promise.all`.
- Bridge streaming pipelines with static scanners by introducing lazy chunk-loading in `SecurityScannerStream`.
- Expose first-class CLI commands for security auditing, license compliance, container generation, secret vaulting, dependency graphing, and artifact verification.

**Tech Stack:** Node.js native (`node:stream`, `node:crypto`, `node:fs`, `node:path`), ECMAScript Modules (ESM).

---

## Global Constraints
- **Zero External Dependencies**: Every feature, command, and test must run purely on native Node.js (>= 18.0.0) standard library.
- **Sub-50ms Execution Guarantee**: Benchmarks must remain well under 50ms (average 2-5ms).
- **Zero External Telemetry**: 100% offline, no phone-home network calls.
- **Atomic & Reversible File Operations**: File writes must be atomic with rollback cleanup on error.
- **Cross-Platform Compatibility**: Path handling must work seamlessly across Windows (backslashes) and POSIX.

---

## Review Focus
1. **Uninterrupted Parallel Pipeline Execution**: Circular dependencies or stage failure in a concurrent wave must abort gracefully and respect the `--bail` option.
2. **Lazy Content Loading in Security Scanner**: Piped files without pre-loaded memory buffers must be read on demand without exhausting file descriptors.
3. **Cryptographic Salt Randomness in EnvVault**: Salt must be cryptographically random per payload (16 bytes) and backward-compatible with 3-segment legacy vaults.
4. **POSIX Clustered Short Flags**: Flags like `-sv` must expand correctly to `-s` and `-v`.
5. **No Orphaned Temp Files**: Interrupted atomic file writes must clean up temporary files in catch blocks.

---

## Task Decomposition

### Task 1: Repository Hygiene & Packaging Standards
**Files:**
- Create: `.gitignore`
- Create: `LICENSE`
- Modify: `package.json`

**Steps:**
- [ ] Create `.gitignore` ignoring build artifacts (`.build-cache`, `coverage`, `dist/test-app`, `tests/.tmp-*`, `tests/temp-*`), `.env*`, and OS junk.
- [ ] Create `LICENSE` with standard MIT terms matching `package.json`.
- [ ] Update `package.json` with `"files": ["bin", "lib", "README.md", "LICENSE"]`, add `"lint"` check script, and add automation command aliases.
- [ ] Verify `npm test` still runs cleanly.

---

### Task 2: Resilience & Security Hardening (File Utilities & EnvVault)
**Files:**
- Modify: `lib/utils/file-utils.js`
- Modify: `lib/automation/env-vault.js`
- Test: `tests/utils.test.js`
- Test: `tests/automation.test.js`

**Steps:**
- [ ] Update `writeAtomic` in `lib/utils/file-utils.js` with `try...catch` ensuring `tempName` is unlinked if writing or renaming fails.
- [ ] Update `EnvVault` in `lib/automation/env-vault.js` to generate dynamic 16-byte random salts per encryption, storing as `salt:iv:authTag:encrypted`, while supporting legacy 3-part format on decryption.
- [ ] Add unit tests in `tests/utils.test.js` for atomic write cleanup on failure.
- [ ] Add unit tests in `tests/automation.test.js` for EnvVault encryption/decryption with dynamic salts and legacy fallback.
- [ ] Run `npm test` to verify.

---

### Task 3: Stream & Pipeline Step Registry Integration
**Files:**
- Modify: `lib/automation/security-scanner.js`
- Modify: `lib/pipeline/step-registry.js`
- Test: `tests/streams.test.js`

**Steps:**
- [ ] Update `SecurityScannerStream.processChunk` in `lib/automation/security-scanner.js` to lazy-load `entry.fullPath` when `entry.content` is not provided.
- [ ] Register `security`, `license`, `verify`, and `optimize` in `lib/pipeline/step-registry.js`.
- [ ] Add unit test verifying `SecurityScannerStream` works when piped directly from `FileScannerStream`.
- [ ] Run `npm test` to verify.

---

### Task 4: Parallel Wave Execution in DAG Engine
**Files:**
- Modify: `lib/pipeline/dag-executor.js`
- Test: `tests/pipeline-dag.test.js`

**Steps:**
- [ ] Implement `getExecutionWaves()` in `DAGExecutor` to partition stages into topological concurrent waves.
- [ ] Update `DAGExecutor.execute()` to run stages within each wave concurrently using `Promise.all()`, respecting `--bail` and concurrency flags.
- [ ] Add tests in `tests/pipeline-dag.test.js` verifying that parallel stages execute concurrently and correctly report timings.
- [ ] Run `npm test` to verify.

---

### Task 5: CLI Engine Ergonomics & Output Polish
**Files:**
- Modify: `lib/core/cli-engine.js`
- Test: `tests/cli-engine.test.js`

**Steps:**
- [ ] Update `helpInformation()` so `Usage:` only shows `[command]` when `this._commands.size > 0`.
- [ ] Add clustered short flag expansion (e.g. `-sv` -> `-s` and `-v`).
- [ ] Add tests in `tests/cli-engine.test.js` for clustered flags and help output.
- [ ] Run `npm test` to verify.

---

### Task 6: Exposing Automation Modules in CLI & Filling Untested Gaps
**Files:**
- Modify: `bin/streamforge.js`
- Create: `tests/untested-automation.test.js`
- Modify: `tests/runner.js`
- Modify: `README.md`

**Steps:**
- [ ] Expose subcommands in `bin/streamforge.js`: `audit`/`security`, `license`, `changelog`, `docker`, `vault`, `verify`, `graph`, `optimize`.
- [ ] Create `tests/untested-automation.test.js` providing 100% test coverage for `DockerGenerator`, `GitWorkflowEngine`, `CodeBundler`, and `EnvVault`.
- [ ] Register the new test suite in `tests/runner.js`.
- [ ] Update `README.md` to document the new CLI commands and parallel DAG execution.
- [ ] Run `npm test` and `npm run benchmark` to verify 100% test passes and latency < 50ms.
