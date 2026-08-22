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
  verifyStudentToken,
  loginDemoUser,
  AuthUser,
} from "../lib/auth"

interface AuthContextValue {
  user: AuthUser | null
  token: string | null
  isLoading: boolean
  isAuthenticated: boolean
  login: (email: string, password: string) => Promise<{ orgSlug?: string }>
  register: (email: string, password: string, orgSlug: string, orgName: string) => Promise<{ orgSlug?: string }>
  loginStudent: (token: string) => Promise<AuthUser>
  loginDemo: (role?: 'student' | 'admin', orgSlug?: string, name?: string) => Promise<AuthUser>
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

  const loginStudent = useCallback(async (inviteToken: string) => {
    const resultUser = await verifyStudentToken(inviteToken)
    setUser(resultUser)
    setTokenState(getToken())
    return resultUser
  }, [])

  const loginDemo = useCallback(
    async (role: 'student' | 'admin' = 'student', orgSlug: string = 'demo', name?: string) => {
      const resultUser = await loginDemoUser(role, orgSlug, name)
      setUser(resultUser)
      setTokenState(getToken())
      return resultUser
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
      loginStudent,
      loginDemo,
      logout,
    }),
    [user, token, isLoading, login, register, loginStudent, loginDemo, logout]
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>")
  return ctx
}
