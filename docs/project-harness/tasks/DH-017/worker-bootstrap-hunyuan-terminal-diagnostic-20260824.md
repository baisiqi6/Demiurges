# DH-017 Worker Bootstrap — Hunyuan terminal diagnostic

## Role and objective

You are `omp-deepseek-v4-flash-hunyuan-terminal-worker`, a bounded coding Worker. Start your final response with `ACCEPT`, then finish with a `RESULT` section.

Prepare the smallest operator-only diagnostic that can query the already-created Hunyuan Job exactly once and print only its terminal `Status` plus stable provider `ErrorCode`. The product purpose is to decide the smallest correction before any new paid submit, not to add a general diagnostic framework.

## CWD and authority

- CWD/worktree: `/Users/Admin/projects/WorkTrees/Demiurges-DH-017`
- Canonical plan: `docs/project-harness/tasks/DH-017/plan.md`, especially the 2026-08-24 scope section.
- Existing failed Job evidence: `.artifacts/canary/DH-017/20260820T121931Z/hunyuan`
- You may read current code, tests, Git diff/status, the plan, and that evidence root.
- You may create or modify only:
  - `.artifacts/canary/DH-017/20260824T1407Z/hunyuan-terminal-diagnostic/operator-diagnostic.ts`
  - `.artifacts/canary/DH-017/20260824T1407Z/hunyuan-terminal-diagnostic/worker-result.md`
- Do not modify product code, tests, Harness files, existing canary roots, or any other path.

## Hard prohibitions

- Do not read macOS Keychain or any credential.
- Do not call Hunyuan, Marble, or any external network endpoint.
- Do not execute the diagnostic against the real Job.
- Do not print or copy the real JobId, provider RequestId, ErrorMessage, raw response, signed URL, prompt, or credential.
- Do not commit, push, merge, deploy, reset, clean, or install dependencies.
- Stop if a safe exact-one-query diagnostic would require changing product code or widening the allowlist.

## Minimal acceptance

- This is a one-off evidence script, not product code. Keep `operator-diagnostic.ts` at or below roughly 120 source lines; do not deliberate or implement alternative architectures.
- Use the already exported `readKeychainCredential`, `hunyuanQueryUrl`, `decodeProviderResponseJsonBytes`, and `decodeHunyuanQueryResponse` primitives. A single direct `fetch` plus the existing exact decoder is sufficient; do not add streaming/body-budget/retry/framework code to this evidence script.
- After `decodeHunyuanQueryResponse(..., "cloud-response-v1", jobId)` proves the response is a valid terminal failure, perform only the tiny plain-object extraction needed to read `Response.Status` and `Response.ErrorCode` from the same decoded value. Require exact `FAIL` and a conservative stable ErrorCode token; never read or serialize `ErrorMessage`.
- Runtime takes the JobId only in memory/argv and performs at most one authenticated query.
- Success output is a fixed small JSON object containing only a diagnostic kind, `Status`, and provider `ErrorCode`; no raw message or identity values.
- Any malformed/non-terminal/non-200/abort/timeout condition emits one fixed stopped code and no response content; no retry.
- No framework, registry, new provider abstraction, retry/backoff, logging subsystem, or persistent raw capture.
- Perform only offline checks with injected fake fetch/credential or static inspection. Record commands and concise evidence in `worker-result.md`.
- Do not scan more files than the named primitives require. Write the two allowed files promptly; if a minor uncertainty remains, record it for Reviewer instead of adding mechanisms.

## Final output

Chinese-first. Report requested and observed model/provider/session evidence when available, exact files written, offline checks, and any remaining Operator-only execution step. Never include secrets or the real JobId.
