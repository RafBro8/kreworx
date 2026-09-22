import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";

import { ApiRequestError, getMe, signInAsDemo, signOut as postSignOut } from "../lib/api";
import { AuthContext, type AuthState, type AuthValue } from "./context";

export default function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({ status: "loading" });

  const refresh = useCallback(async () => {
    try {
      setState({ status: "signedIn", me: await getMe() });
    } catch (error) {
      // Only a 401 means "not signed in". Anything else - the API asleep, a
      // network blip - should not quietly throw someone back to the start.
      if (error instanceof ApiRequestError && error.status === 401) {
        setState({ status: "signedOut" });
      } else {
        throw error;
      }
    }
  }, []);

  useEffect(() => {
    let current = true;
    getMe()
      .then((me) => current && setState({ status: "signedIn", me }))
      // Unreachable or asleep reads as signed out on first load: the welcome
      // screen is where the "waking the server" message lives.
      .catch(() => current && setState({ status: "signedOut" }));
    return () => {
      current = false;
    };
  }, []);

  const signInAs = useCallback(
    async (userId: string) => {
      await signInAsDemo(userId);
      await refresh();
    },
    [refresh],
  );

  const signOut = useCallback(async () => {
    await postSignOut();
    setState({ status: "signedOut" });
  }, []);

  const value = useMemo<AuthValue>(() => ({ ...state, signInAs, signOut }), [state, signInAs, signOut]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
