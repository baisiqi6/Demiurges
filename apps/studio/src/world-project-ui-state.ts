import type { ProductSessionProjection } from "@demiurges/world";

function authorityKey(value: ProductSessionProjection): string {
  const authority = value.world;
  return authority === null
    ? "none"
    : `${authority.ref.name}\u0000${authority.ref.snapshotId}\u0000${authority.ref.version}`;
}

export function hasWorldAuthorityTransition(
  prior: ProductSessionProjection,
  next: ProductSessionProjection,
): boolean {
  return authorityKey(prior) !== authorityKey(next);
}

export function canExportBoundProject(
  hasActiveProject: boolean,
  dirty: boolean,
  running: boolean,
): boolean {
  return hasActiveProject && !dirty && !running;
}
