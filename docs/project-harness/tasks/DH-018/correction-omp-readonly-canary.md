# DH-018 OMP canary correction — readonly runtime failure

Operator independently accepted the terminal-boundary fix (24/0 tests, root typecheck pass) and reran the real pinned OMP canary.

The empty success is now correctly converted to:

```text
OmpAgentTurnError: OMP turn 以 stopReason=error 终止：Attempted to assign to readonly property.
events: turn.started → turn.failed
trace: []
```

Resume the same diagnostic Worker. Determine from current app + OMP 17.2.12/provider adapter source which object is readonly and where mutation occurs. Implement only a proven minimal boundary copy/unfreeze if necessary. Do not remove freezing from world domain values, do not add retry/fallback, and do not guess from the error string. Add focused regression coverage. If the precise mutation target cannot be proven, update RESULT to BLOCKED with evidence.

Do not run Marble/Hunyuan, Keychain, generation, network search, commit, push, or deploy. Operator will rerun the real canary.
