export interface PortableAccountIdentity {
  username: string;
  userId?: string;
  isAdmin: boolean;
}

export interface PortableUserSession {
  userId: number;
  userName: string;
  isAdmin: boolean;
  loginTime: Date;
}

export function isPortableRuntimeValue(value: string | undefined): boolean {
  return value?.trim().toLowerCase() === "true";
}

export function isPortableRuntime(): boolean {
  return isPortableRuntimeValue(import.meta.env.VITE_PORTABLE_MODE);
}

export function shouldInitializeBrowserAdmin(
  password: string | undefined,
  portableMode = false
): password is string {
  return !portableMode && Boolean(password?.trim());
}

export function stablePortableUserId(value: string): number {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  return (hash >>> 0) || 1;
}

export function portableAccountToSession(
  account: PortableAccountIdentity,
  loginTime: Date = new Date()
): PortableUserSession {
  const identity = account.userId || account.username;
  return {
    userId: stablePortableUserId(identity),
    userName: account.username,
    isAdmin: account.isAdmin,
    loginTime,
  };
}
