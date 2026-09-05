# DH-018 core binding — Operator integration result

- Result: `COMPLETE` for selector → session fixture → `WorldToolSurface` binding
- Tool set remains exactly `read`, `write`, `edit`, `run`
- Frozen static registry remains unchanged

## Integration

- Moved fixed session calibration/witness/snapshot IDs to the composite fixture boundary so the constructor and validator share exact constants without a new registry.
- Added an explicit generated-session branch to the existing composite validator. It preserves exact environment/floor identity, exact fixed session IDs, authored-box-proxy semantics, canonical state/physics rules, and existing edit pose constraints.
- `WorldToolSurface(host, binding?)` uses the session fixture only when the Host supplies a binding; no binding keeps the existing canonical fixture.
- Exported only the constructor, half-extents helper, binding type, and fixed IDs.

## Operator verification

- focused fixture/surface tests: 9 pass, 0 fail
- canonical registry/composite plus focused tests: 276 pass, 0 fail, 378 assertions
- `bun run typecheck`: pass
- targeted `git diff --check`: pass
- real bound `WorldToolSurface.run`: deterministic Evaluation `passed=true`

## Remaining DH-018 work

Product Session must obtain the unique binding from `GeneratedArtifactReader.list()`, pin it when creating the session, and prove the fail→read→repair→pass trace. No provider call is needed or allowed.
