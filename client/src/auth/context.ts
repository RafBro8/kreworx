import { createContext, useContext } from "react";

import type { Me } from "../lib/api";

export type AuthState =
  | { status: "loading" }
  | { status: "signedOut" }
  | { status: "signedIn"; me: Me };

export type AuthValue = AuthState & {
  signInAs: (userId: string) => Promise<void>;
  signOut: () => Promise<void>;
};

export const AuthContext = createContext<AuthValue | null>(null);

export function useAuth(): AuthValue {
  const value = useContext(AuthContext);
  if (!value) throw new Error("useAuth must be used inside <AuthProvider>");
  return value;
}

/** For screens that only render once someone is signed in. */
export function useMe(): Me {
  const auth = useAuth();
  if (auth.status !== "signedIn") throw new Error("useMe must be used behind <RequireAuth>");
  return auth.me;
}
