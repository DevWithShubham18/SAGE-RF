import { useEffect, useState } from "react";
import { createUserProfile } from "../firebase/user";
import { onAuthStateChanged } from "firebase/auth";
import {
  Activity,
  LockKeyhole,
  LogIn,
  Radio,
  UserPlus,
} from "lucide-react";

import { auth } from "../firebase/firebase";
import {
  loginUser,
  registerUser,
} from "../firebase/auth";

export default function AuthGate({ children }) {
  const [user, setUser] = useState(null);
  const [checking, setChecking] = useState(true);

  const [mode, setMode] = useState("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(
      auth,
      (currentUser) => {
        setUser(currentUser);
        setChecking(false);
      }
    );

    return unsubscribe;
  }, []);

  async function handleSubmit(event) {
    event.preventDefault();

    setError("");

    if (!email.trim() || !password) {
      setError("Enter your email and password.");
      return;
    }

    setBusy(true);

    try {
      let authenticatedUser;

if (mode === "login") {
  authenticatedUser = await loginUser(
    email.trim(),
    password
  );
} else {
  authenticatedUser = await registerUser(
    email.trim(),
    password
  );
}

await createUserProfile(authenticatedUser);
    } catch (err) {
      console.error(err);

      switch (err.code) {
        case "auth/invalid-credential":
          setError("Incorrect email or password.");
          break;

        case "auth/email-already-in-use":
          setError("An account with this email already exists.");
          break;

        case "auth/weak-password":
          setError("Password must be at least 6 characters.");
          break;

        case "auth/invalid-email":
          setError("Enter a valid email address.");
          break;

        case "auth/network-request-failed":
          setError("Network error. Check your internet connection.");
          break;

        default:
          setError(
            err.message || "Authentication failed."
          );
      }
    } finally {
      setBusy(false);
    }
  }

  if (checking) {
    return (
      <div className="auth-loading">
        <div className="auth-loading-mark">
          <Radio size={28} />
        </div>

        <div className="auth-loading-title">
          SAGE-RF
        </div>

        <div className="auth-loading-status">
          AUTHENTICATING SYSTEM
        </div>
      </div>
    );
  }

  if (user) {
    return children;
  }

  return (
    <div className="auth-screen">
      <div className="auth-grid" />

      <div className="auth-glow auth-glow-one" />
      <div className="auth-glow auth-glow-two" />

      <div className="auth-card">
        <div className="auth-brand">
          <div className="auth-brand-mark">
            <Radio size={22} />
          </div>

          <div>
            <div className="auth-brand-name">
              SAGE<span>-RF</span>
            </div>

            <div className="auth-brand-subtitle">
              SIGNAL INTELLIGENCE PLATFORM
            </div>
          </div>
        </div>

        <div className="auth-divider" />

        <div className="auth-heading">
          <div className="auth-kicker">
            <Activity size={13} />
            SECURE ACCESS
          </div>

          <h1>
            {mode === "login"
              ? "Welcome back."
              : "Create your account."}
          </h1>

          <p>
            {mode === "login"
              ? "Sign in to access your RF intelligence workstation."
              : "Create an account to save signals and analysis history."}
          </p>
        </div>

        <form onSubmit={handleSubmit}>
          <label className="auth-field">
            <span>EMAIL</span>

            <input
              type="email"
              value={email}
              autoComplete="email"
              placeholder="operator@example.com"
              onChange={(event) =>
                setEmail(event.target.value)
              }
            />
          </label>

          <label className="auth-field">
            <span>PASSWORD</span>

            <input
              type="password"
              value={password}
              autoComplete={
                mode === "login"
                  ? "current-password"
                  : "new-password"
              }
              placeholder="••••••••"
              onChange={(event) =>
                setPassword(event.target.value)
              }
            />
          </label>

          {error && (
            <div className="auth-error">
              <LockKeyhole size={15} />
              <span>{error}</span>
            </div>
          )}

          <button
            className="auth-submit"
            type="submit"
            disabled={busy}
          >
            {busy ? (
              <>
                <span className="auth-spinner" />
                AUTHENTICATING...
              </>
            ) : mode === "login" ? (
              <>
                <LogIn size={17} />
                SIGN IN
              </>
            ) : (
              <>
                <UserPlus size={17} />
                CREATE ACCOUNT
              </>
            )}
          </button>
        </form>

        <div className="auth-switch">
          <span>
            {mode === "login"
              ? "Don't have an account?"
              : "Already have an account?"}
          </span>

          <button
            type="button"
            onClick={() => {
              setError("");
              setMode(
                mode === "login"
                  ? "register"
                  : "login"
              );
            }}
          >
            {mode === "login"
              ? "Create account"
              : "Sign in"}
          </button>
        </div>

        <div className="auth-security">
          <LockKeyhole size={14} />

          <span>
            Protected by Firebase Authentication
          </span>
        </div>
      </div>
    </div>
  );
}