/**
 * AuthContext tests — Players app (web + iOS Capacitor)
 *
 * Covers:
 *  - Default context returns nulls + loading=true when used outside provider
 *  - On mount: subscribes to onAuthStateChange (single source of truth)
 *  - INITIAL_SESSION flips loading=false and pushes session/user into context
 *  - Sign-in event fetches the user's profile from `profiles`
 *  - Sign-out clears session, user, profile
 *  - The 2-second fallback calls getSession if INITIAL_SESSION never arrives
 *  - Pending referral in localStorage is consumed on first SIGNED_IN event
 *  - Capacitor deep-link listener is registered ONLY on native platforms
 *  - PKCE deep-link calls exchangeCodeForSession with the right code
 *  - Implicit-flow deep-link calls setSession with both tokens
 *  - Unmount unsubscribes from auth + clears deep-link listeners
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, act, renderHook, waitFor } from "@testing-library/react";
import React from "react";

/* ---- Mocks: Capacitor SDKs ------------------------------------------- */
const isNativePlatform = vi.fn(() => false);
const appAddListener = vi.fn();
const appRemoveAllListeners = vi.fn();
const browserClose = vi.fn(() => Promise.resolve());

vi.mock("@capacitor/core", () => ({
  Capacitor: { isNativePlatform: () => isNativePlatform() },
}));
vi.mock("@capacitor/app", () => ({
  App: {
    addListener: (...args: unknown[]) => appAddListener(...args),
    removeAllListeners: () => appRemoveAllListeners(),
  },
}));
vi.mock("@capacitor/browser", () => ({
  Browser: { close: () => browserClose() },
}));

/* ---- Mocks: Supabase client ------------------------------------------ */
const unsubscribe = vi.fn();
let authChangeCb: ((event: string, session: unknown) => Promise<void> | void) | null = null;

const mockGetSession = vi.fn();
const mockOnAuthStateChange = vi.fn((cb) => {
  authChangeCb = cb;
  return { data: { subscription: { unsubscribe } } };
});
const mockSignOut = vi.fn();
const mockExchangeCodeForSession = vi.fn();
const mockSetSession = vi.fn();
const mockFunctionsInvoke = vi.fn(() => Promise.resolve({ data: null, error: null }));

// Chainable from().select().eq().single() that resolves to a profile
const fakeProfile = { id: "p1", user_id: "u1", display_name: "Alex" };
const mockSingle = vi.fn(() => Promise.resolve({ data: fakeProfile, error: null }));
const mockEq = vi.fn(() => ({ single: mockSingle }));
const mockSelect = vi.fn(() => ({ eq: mockEq }));
const mockFrom = vi.fn(() => ({ select: mockSelect }));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    auth: {
      getSession: () => mockGetSession(),
      onAuthStateChange: (cb: typeof authChangeCb) => mockOnAuthStateChange(cb),
      signOut: () => mockSignOut(),
      exchangeCodeForSession: (code: string) => mockExchangeCodeForSession(code),
      setSession: (args: unknown) => mockSetSession(args),
    },
    from: (table: string) => mockFrom(table),
    functions: { invoke: (name: string, args: unknown) => mockFunctionsInvoke(name, args) },
  },
}));

// Import after mocks
import { AuthProvider, useAuth } from "../AuthContext";

beforeEach(() => {
  vi.clearAllMocks();
  vi.useRealTimers();
  authChangeCb = null;
  isNativePlatform.mockReturnValue(false);
  mockGetSession.mockResolvedValue({ data: { session: null } });
  mockSignOut.mockResolvedValue({ error: null });
  mockSingle.mockResolvedValue({ data: fakeProfile, error: null });
  localStorage.clear();
});

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <AuthProvider>{children}</AuthProvider>
);

describe("AuthContext — Players", () => {
  it("default context (no provider) returns nulls + loading=true", () => {
    const { result } = renderHook(() => useAuth());
    expect(result.current.session).toBeNull();
    expect(result.current.user).toBeNull();
    expect(result.current.profile).toBeNull();
    expect(result.current.loading).toBe(true);
  });

  it("on mount: subscribes to onAuthStateChange", () => {
    renderHook(() => useAuth(), { wrapper });
    expect(mockOnAuthStateChange).toHaveBeenCalledTimes(1);
  });

  it("INITIAL_SESSION event flips loading=false and stores session", async () => {
    const { result } = renderHook(() => useAuth(), { wrapper });
    const fakeSession = { user: { id: "u1", email: "p@x.io" }, access_token: "tok" };

    await act(async () => {
      await authChangeCb!("INITIAL_SESSION", fakeSession);
    });

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.session).toEqual(fakeSession);
    expect(result.current.user).toEqual(fakeSession.user);
  });

  it("on SIGNED_IN, fetches the profile from supabase.profiles", async () => {
    const { result } = renderHook(() => useAuth(), { wrapper });
    const fakeSession = { user: { id: "u1" }, access_token: "tok" };

    await act(async () => {
      await authChangeCb!("SIGNED_IN", fakeSession);
      // setTimeout(..., 0) for profile fetch
      await new Promise((r) => setTimeout(r, 10));
    });

    expect(mockFrom).toHaveBeenCalledWith("profiles");
    expect(mockEq).toHaveBeenCalledWith("user_id", "u1");
    await waitFor(() => expect(result.current.profile).toEqual(fakeProfile));
  });

  it("on first SIGNED_IN, consumes xplay_pending_ref from localStorage", async () => {
    localStorage.setItem("xplay_pending_ref", "REFCODE123");
    renderHook(() => useAuth(), { wrapper });

    await act(async () => {
      await authChangeCb!("SIGNED_IN", { user: { id: "u1" } });
      await new Promise((r) => setTimeout(r, 10));
    });

    expect(localStorage.getItem("xplay_pending_ref")).toBeNull();
    expect(mockFunctionsInvoke).toHaveBeenCalledWith("process-referral", {
      body: { referral_code: "REFCODE123" },
    });
  });

  it("does NOT invoke referral function when there is no pending ref", async () => {
    renderHook(() => useAuth(), { wrapper });

    await act(async () => {
      await authChangeCb!("SIGNED_IN", { user: { id: "u1" } });
      await new Promise((r) => setTimeout(r, 10));
    });

    expect(mockFunctionsInvoke).not.toHaveBeenCalled();
  });

  it("signOut: clears session, user, and profile and calls supabase.auth.signOut", async () => {
    const { result } = renderHook(() => useAuth(), { wrapper });
    // Sign in first so signOut has something to clear
    await act(async () => {
      await authChangeCb!("SIGNED_IN", { user: { id: "u1" } });
      await new Promise((r) => setTimeout(r, 10));
    });
    await waitFor(() => expect(result.current.user).not.toBeNull());

    await act(async () => {
      await result.current.signOut();
    });

    expect(mockSignOut).toHaveBeenCalledTimes(1);
    expect(result.current.session).toBeNull();
    expect(result.current.user).toBeNull();
    expect(result.current.profile).toBeNull();
  });

  it("SIGNED_OUT event clears profile back to null", async () => {
    const { result } = renderHook(() => useAuth(), { wrapper });

    await act(async () => {
      await authChangeCb!("SIGNED_IN", { user: { id: "u1" } });
      await new Promise((r) => setTimeout(r, 10));
    });
    await waitFor(() => expect(result.current.profile).not.toBeNull());

    await act(async () => {
      await authChangeCb!("SIGNED_OUT", null);
    });

    expect(result.current.profile).toBeNull();
    expect(result.current.user).toBeNull();
  });

  it("2-second fallback calls getSession when INITIAL_SESSION never fires", async () => {
    vi.useFakeTimers();
    const fakeSession = { user: { id: "u-fb" }, access_token: "tk" };
    mockGetSession.mockResolvedValue({ data: { session: fakeSession } });

    const { result } = renderHook(() => useAuth(), { wrapper });

    // Advance past the 2s fallback
    await act(async () => {
      vi.advanceTimersByTime(2100);
    });
    // Flush microtasks for getSession().then(...)
    await act(async () => {
      await vi.runAllTimersAsync();
    });

    expect(mockGetSession).toHaveBeenCalled();
    expect(result.current.user).toEqual(fakeSession.user);
    vi.useRealTimers();
  });

  it("Capacitor: does NOT register deep-link listener on web (non-native)", () => {
    isNativePlatform.mockReturnValue(false);
    renderHook(() => useAuth(), { wrapper });
    expect(appAddListener).not.toHaveBeenCalled();
  });

  it("Capacitor: registers appUrlOpen listener on native platforms", () => {
    isNativePlatform.mockReturnValue(true);
    renderHook(() => useAuth(), { wrapper });

    expect(appAddListener).toHaveBeenCalledTimes(1);
    expect(appAddListener.mock.calls[0][0]).toBe("appUrlOpen");
  });

  it("Capacitor PKCE deep-link: exchangeCodeForSession + stores referral code", async () => {
    isNativePlatform.mockReturnValue(true);
    mockExchangeCodeForSession.mockResolvedValue({ data: null, error: null });

    renderHook(() => useAuth(), { wrapper });

    // Pull the registered handler out of the mock and invoke it
    const handler = appAddListener.mock.calls[0][1] as (e: { url: string }) => Promise<void>;
    await act(async () => {
      await handler({ url: "xplay://auth/callback?code=ABCDEF&ref=PROMO9" });
    });

    expect(mockExchangeCodeForSession).toHaveBeenCalledWith("ABCDEF");
    expect(localStorage.getItem("xplay_pending_ref")).toBe("PROMO9");
  });

  it("Capacitor implicit-flow deep-link: setSession with access+refresh tokens", async () => {
    isNativePlatform.mockReturnValue(true);
    mockSetSession.mockResolvedValue({ data: null, error: null });

    renderHook(() => useAuth(), { wrapper });
    const handler = appAddListener.mock.calls[0][1] as (e: { url: string }) => Promise<void>;

    await act(async () => {
      await handler({
        url: "xplay://auth/callback#access_token=AT123&refresh_token=RT456",
      });
    });

    expect(mockSetSession).toHaveBeenCalledWith({
      access_token: "AT123",
      refresh_token: "RT456",
    });
  });

  it("Capacitor deep-link: ignores URLs that don't start with xplay://", async () => {
    isNativePlatform.mockReturnValue(true);
    renderHook(() => useAuth(), { wrapper });
    const handler = appAddListener.mock.calls[0][1] as (e: { url: string }) => Promise<void>;

    await act(async () => {
      await handler({ url: "https://example.com/auth/callback?code=foo" });
    });

    expect(mockExchangeCodeForSession).not.toHaveBeenCalled();
    expect(mockSetSession).not.toHaveBeenCalled();
  });

  it("unmount unsubscribes from auth state listener", () => {
    const { unmount } = render(
      <AuthProvider>
        <div>child</div>
      </AuthProvider>,
    );
    expect(screen.getByText("child")).toBeInTheDocument();
    unmount();
    expect(unsubscribe).toHaveBeenCalled();
  });

  it("unmount on native platform also clears all Capacitor App listeners", () => {
    isNativePlatform.mockReturnValue(true);
    const { unmount } = render(
      <AuthProvider>
        <div>child</div>
      </AuthProvider>,
    );
    unmount();
    expect(appRemoveAllListeners).toHaveBeenCalled();
  });
});
