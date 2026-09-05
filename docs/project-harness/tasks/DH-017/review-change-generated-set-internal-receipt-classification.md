# DH-017 generated-set internal receipt classification: review change

## Review finding to correct

The read classifier correctly recognizes generated-set binding/result bytes, but
`inspectDataRootCapacity()` currently accepts such receipts while the Generation
namespace is `absent-no-intent`, `install-intent-pending`, or
`directory-published-result-pending`.

That lifecycle combination is impossible: an `artifact.publish-generated-set`
intent requires a born generation and complete private candidate set, and those
exist only after the namespace is `terminal-installed`.

## Minimal required correction

- Keep all current three-way codec classification and public denial behavior.
- In capacity inspection, reject any `internal-generated-set` binding unless the
  namespace state is exactly `terminal-installed`.
- Preserve exact namespace-install identity validation. Avoid a generic policy
  table or new abstraction; a direct local condition is preferred.
- Reverse the existing absent/result-pending positive tests to fail-closed, and
  add/retain the install-intent-pending counterexample if it is not already
  covered. Keep terminal-installed coexistence positive.
- Do not change OperationJournal, admission, capability, startup, CAS, public
  exports, or any file outside the original allowlist unless a compile-only test
  import requires it.

Run focused tests, typecheck, relevant diff check, and proportional full tests.
Return a compact Chinese remediation RESULT. No commit/push/deploy/network/
credential/provider action.
