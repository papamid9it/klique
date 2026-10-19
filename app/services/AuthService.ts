import ApiClient from "@/app/ApiCore";
import type { CityId } from "@/lib/constants";
import type { AuthConfigDTO, Envelope, UserMe } from "@/lib/types";

const api = new ApiClient();

export interface SignupInput {
  email: string;
  password: string;
  displayName: string;
  handle: string;
  country: string;
  region: string;
  city: CityId;
}

/** `token` is only present for native/desktop clients (see ApiClient.configure({ native: true })). */
export interface AuthPayload {
  user: UserMe;
  token?: string;
}

export const AuthService = {
  signup: (input: SignupInput) => api.post<Envelope<AuthPayload>>("/api/auth/signup", input),
  login: (email: string, password: string) => api.post<Envelope<AuthPayload>>("/api/auth/login", { email, password }),
  logout: () => api.post<Envelope<{ signedOut: boolean }>>("/api/auth/logout"),
  /** Which sign-in options this server has switched on (Google, real email). */
  config: () => api.get<Envelope<AuthConfigDTO>>("/api/auth/config", undefined, { ttl: 300 }),
  /** Where the browser goes for "Continue with Google" (a navigation, not a fetch). */
  googleUrl: (next = "/") => ApiClient.url(`/api/auth/google?next=${encodeURIComponent(next)}`),
  /** Mobile app: where the in-app browser goes. `challenge` is sha256 hex of a secret `verifier` the app keeps. */
  googleNativeUrl: (redirect: string, challenge: string) =>
    ApiClient.url(`/api/auth/google?client=native&redirect=${encodeURIComponent(redirect)}&challenge=${challenge}`),
  /** Mobile app: trade the one-time code from Google sign-in for a session (the response carries the token). */
  exchangeGoogleCode: (code: string, verifier: string) => api.post<Envelope<AuthPayload>>("/api/auth/exchange", { code, verifier }),
  verifyEmail: (token: string) => api.post<Envelope<{ verified: true }>>("/api/auth/verify", { token }),
  resendVerification: () => api.post<Envelope<{ sent: boolean; alreadyVerified: boolean }>>("/api/auth/verify/resend"),
  forgotPassword: (email: string) => api.post<Envelope<{ sent: true }>>("/api/auth/forgot", { email }),
  /** Is this reset link still good? */
  checkResetToken: (token: string) => api.put<Envelope<{ valid: true }>>("/api/auth/reset", { token }),
  resetPassword: (token: string, password: string) => api.post<Envelope<{ reset: true }>>("/api/auth/reset", { token, password }),
  /** `currentPassword` can be left out by accounts that signed up with Google and have no password yet. */
  changePassword: (newPassword: string, currentPassword?: string) => api.post<Envelope<AuthPayload>>("/api/auth/password", { newPassword, currentPassword }),
  /** Invalidates every session on every device. */
  logoutEverywhere: () => api.post<Envelope<{ signedOut: boolean }>>("/api/auth/logout-all"),
};
