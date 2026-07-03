// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AccountAuth } from "./account-auth";
import * as authClient from "@/lib/auth-client";

const { replace, push } = vi.hoisted(() => ({ replace: vi.fn(), push: vi.fn() }));

vi.mock("next/navigation", () => ({ useRouter: () => ({ replace, push, prefetch: vi.fn() }) }));

// Keep the real AuthClientError (the component branches on its `code`), stub the
// network calls.
vi.mock("@/lib/auth-client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/auth-client")>();
  return {
    ...actual,
    fetchSession: vi.fn(),
    login: vi.fn(),
    register: vi.fn(),
    requestReset: vi.fn(),
    resendConfirmation: vi.fn(),
    checkAvailability: vi.fn()
  };
});

beforeEach(() => {
  vi.mocked(authClient.fetchSession).mockResolvedValue(null);
  replace.mockClear();
  push.mockClear();
});

afterEach(cleanup);

describe("AccountAuth", () => {
  it("shows Sign in and Register tabs, sign-in fields by default", () => {
    render(<AccountAuth />);
    expect(screen.getByRole("tab", { name: /Sign in/i })).toBeTruthy();
    expect(screen.getByRole("tab", { name: /Register/i })).toBeTruthy();
    expect(screen.getByLabelText(/Nickname or email/i)).toBeTruthy();
  });

  it("switches to the Register tab and reveals the registration fields", () => {
    render(<AccountAuth />);
    fireEvent.click(screen.getByRole("tab", { name: /Register/i }));
    expect(screen.getByLabelText(/^Nickname$/i)).toBeTruthy();
    expect(screen.getByLabelText(/^Email$/i)).toBeTruthy();
    expect(screen.getByLabelText(/Discord/i)).toBeTruthy();
  });

  it("shows the confirmation-pending state after a successful registration", async () => {
    vi.mocked(authClient.register).mockResolvedValue({
      profile: { id: "u1", nickname: "Roland" } as never,
      needsConfirmation: true
    });
    render(<AccountAuth />);
    fireEvent.click(screen.getByRole("tab", { name: /Register/i }));
    fireEvent.change(screen.getByLabelText(/^Nickname$/i), { target: { value: "Roland" } });
    fireEvent.change(screen.getByLabelText(/^Email$/i), { target: { value: "roland@erathia.io" } });
    fireEvent.change(screen.getByLabelText(/^Password$/i), { target: { value: "swordsman1" } });
    fireEvent.click(screen.getByRole("button", { name: /Create account/i }));

    await waitFor(() => expect(screen.getByText(/Check your inbox/i)).toBeTruthy());
    expect(screen.getByText(/roland@erathia.io/)).toBeTruthy();
  });

  it("surfaces the specific 'email already registered' error from the server", async () => {
    vi.mocked(authClient.register).mockRejectedValue(new authClient.AuthClientError("EMAIL_TAKEN", "That email is already registered."));
    render(<AccountAuth />);
    fireEvent.click(screen.getByRole("tab", { name: /Register/i }));
    fireEvent.change(screen.getByLabelText(/^Nickname$/i), { target: { value: "Roland" } });
    fireEvent.change(screen.getByLabelText(/^Email$/i), { target: { value: "dup@erathia.io" } });
    fireEvent.change(screen.getByLabelText(/^Password$/i), { target: { value: "swordsman1" } });
    fireEvent.click(screen.getByRole("button", { name: /Create account/i }));

    await waitFor(() => expect(screen.getByText(/email is already registered/i)).toBeTruthy());
  });

  it("offers a resend-confirmation control when sign-in reports an unconfirmed email", async () => {
    vi.mocked(authClient.login).mockRejectedValue(
      new authClient.AuthClientError("EMAIL_NOT_CONFIRMED", "Confirm your email before signing in — check your inbox.")
    );
    render(<AccountAuth />);
    fireEvent.change(screen.getByLabelText(/Nickname or email/i), { target: { value: "roland@erathia.io" } });
    fireEvent.change(screen.getByLabelText(/^Password$/i), { target: { value: "swordsman1" } });
    fireEvent.click(screen.getByRole("button", { name: /^Sign in$/i }));

    await waitFor(() => expect(screen.getByText(/not confirmed yet/i)).toBeTruthy());
    expect(screen.getByRole("button", { name: /Resend link/i })).toBeTruthy();
  });

  it("redirects to /menu when a session already exists", async () => {
    vi.mocked(authClient.fetchSession).mockResolvedValue({ id: "u1", nickname: "Boss" } as never);
    render(<AccountAuth />);
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/menu"));
  });
});
