import { FFIType, dlopen, ptr } from "bun:ffi";
import { isAbsolute } from "node:path";

const AT_FDCWD = -2;
const RENAME_EXCL = 0x00000004;
const LIBSYSTEM_PATH = "/usr/lib/libSystem.B.dylib";

type RenameAtXNoReplace = (
  fromFd: number,
  source: number,
  toFd: number,
  destination: number,
  flags: number,
) => number;

let nativeLibrary: ReturnType<typeof dlopen> | undefined;
let nativeRename: RenameAtXNoReplace | undefined;

export class RenameDirectoryNoReplaceError extends Error {
  readonly code = "GENERATION_RECOVERY_REQUIRED" as const;

  constructor() {
    super("GENERATION_RECOVERY_REQUIRED");
    this.name = "RenameDirectoryNoReplaceError";
  }
}

function recoveryRequired(): never {
  throw new RenameDirectoryNoReplaceError();
}

function requireAbsolutePath(path: string): string {
  if (
    typeof path !== "string" ||
    path.length === 0 ||
    path.includes("\0") ||
    !isAbsolute(path)
  ) {
    return recoveryRequired();
  }
  return path;
}

function loadNativeRename(): RenameAtXNoReplace {
  if (nativeRename !== undefined) return nativeRename;
  if (process.platform !== "darwin") return recoveryRequired();
  try {
    nativeLibrary = dlopen(LIBSYSTEM_PATH, {
      renameatx_np: {
        args: [
          FFIType.i32,
          FFIType.ptr,
          FFIType.i32,
          FFIType.ptr,
          FFIType.u32,
        ],
        returns: FFIType.i32,
      },
    });
    const loaded = nativeLibrary.symbols.renameatx_np as unknown as RenameAtXNoReplace;
    nativeRename = loaded;
    return loaded;
  } catch {
    nativeLibrary = undefined;
    nativeRename = undefined;
    return recoveryRequired();
  }
}

/**
 * Zero-filesystem-mutation capability check. The semantic probe belongs to the
 * durable namespace-install attempt and is intentionally not hidden here.
 */
export function hasRenameDirectoryNoReplaceSymbol(): boolean {
  try {
    loadNativeRename();
    return true;
  } catch {
    return false;
  }
}

/** macOS-only atomic directory publication. There is deliberately no fallback. */
export function renameDirectoryNoReplace(
  sourceInput: string,
  destinationInput: string,
): void {
  const source = requireAbsolutePath(sourceInput);
  const destination = requireAbsolutePath(destinationInput);
  if (source === destination) return recoveryRequired();
  const sourceBytes = Buffer.from(`${source}\0`);
  const destinationBytes = Buffer.from(`${destination}\0`);
  const result = loadNativeRename()(
    AT_FDCWD,
    ptr(sourceBytes),
    AT_FDCWD,
    ptr(destinationBytes),
    RENAME_EXCL,
  );
  if (result !== 0) recoveryRequired();
}
