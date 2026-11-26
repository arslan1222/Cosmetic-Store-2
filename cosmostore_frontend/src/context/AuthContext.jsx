import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
} from "react";

import { authApi } from "../api/endpoints";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  // Get currently logged-in user
  const refreshUser = useCallback(async () => {
    try {
      const res = await authApi.me();

      setUser(res.data.data);
    } catch (error) {
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refreshUser();
  }, [refreshUser]);

  // Login
  const login = async (email, password, remember = false) => {
    const res = await authApi.login({
      email,
      password,
      remember,
    });

    setUser(res.data.data);

    return res.data;
  };

  // Register
  const register = async (payload) => {
    const res = await authApi.register(payload);

    return res.data;
  };

  // Logout
  const logout = async () => {
    try {
      await authApi.logout();
    } catch (error) {
      console.error("Logout request failed:", error);
    } finally {
      // Always remove the user from React state
      setUser(null);
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        setUser,
        loading,
        login,
        register,
        logout,
        refreshUser,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);

  if (!ctx) {
    throw new Error("useAuth must be used within AuthProvider");
  }

  return ctx;
}