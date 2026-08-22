import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react"
import {
  getToken,
  getUser,
  logout as authLogout,
  loginUser,
  registerUser,
  AuthUser,
} from "../lib/auth"

interface AuthContextValue {
  user: AuthUser | null
  token: string | null
  isLoading: boolean
  isAuthenticated: boolean
  login: (email: string, password: string) => Promise<{ orgSlug?: string }>
  register: (email: string, password: string, orgSlug: string, orgName: string) => Promise<{ orgSlug?: string }>
  logout: () => void
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null)
  const [token, setTokenState] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    const storedToken = getToken()
    const storedUser = getUser()
    if (storedToken && storedUser) {
      setUser(storedUser)
      setTokenState(storedToken)
    }
    setIsLoading(false)
  }, [])

  const login = useCallback(async (email: string, password: string) => {
    const resultUser = await loginUser(email, password)
    setUser(resultUser)
    setTokenState(getToken())
    return { orgSlug: resultUser.orgSlug }
  }, [])

  const register = useCallback(
    async (email: string, password: string, orgSlug: string, orgName: string) => {
      const resultUser = await registerUser(email, password, orgSlug, orgName)
      setUser(resultUser)
      setTokenState(getToken())
      return { orgSlug: resultUser.orgSlug }
    },
    []
  )

  const logout = useCallback(() => {
    authLogout()
    setTokenState(null)
    setUser(null)
  }, [])

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      token,
      isLoading,
      isAuthenticated: Boolean(user && token),
      login,
      register,
      logout,
    }),
    [user, token, isLoading, login, register, logout]
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>")
  return ctx
}
