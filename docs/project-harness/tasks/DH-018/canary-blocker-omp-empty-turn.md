# DH-018 Canary Blocker — real OMP turn completes empty

## Evidence

The Operator ran the required real restricted OMP Agent canary twice with `deepseek/deepseek-v4-flash` and the fixed DH-017 generated-object binding.

Both attempts returned a settled Product Session with:

- `turn.completed`
- `tools=[]`
- `runs=[]`
- empty assistant response
- no world Snapshot and no Evaluation

No Marble/Hunyuan provider, Keychain, or generation call occurred.

## Boundary

Scripted Product Session tests and deterministic world/runtime tests pass, but they cannot substitute for the plan's real OMP Agent canary. The likely defect is a silent terminal OMP SDK response/error boundary, not generated-artifact selection or MuJoCo.
