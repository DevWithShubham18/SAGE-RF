import { useEffect, useState } from "react";
import { onAuthStateChanged } from "firebase/auth";
import {
  Activity,
  Eye,
  EyeOff,
  LockKeyhole,
  LogIn,
  Radio,
  ShieldCheck,
  UserPlus,
  Wifi,
  Zap,
} from "lucide-react";

import { auth } from "../firebase/firebase";
import {
  loginUser,
  registerUser,
  logoutUser,
} from "../firebase/auth";

export default function AuthGate({ children }) {
  const [user, setUser] = useState(null);
  const [checking, setChecking] = useState(true);

  const [mode, setMode] = useState("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      setChecking(false);
    });

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
      if (mode === "login") {
        await loginUser(email.trim(), password);
      } else {
        await registerUser(email.trim(), password);
      }
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

        case "auth/too-many-requests":
          setError("Too many attempts. Please wait and try again.");
          break;

        default:
          setError(err.message || "Authentication failed.");
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

        <div className="auth-loading-title">SAGE-RF</div>

        <div className="auth-loading-status">
          AUTHENTICATING SYSTEM
        </div>

        <div className="auth-loading-bar">
          <span />
        </div>
      </div>
    );
  }

  if (user) {
    return (
      <div className="authenticated-shell">
        <div className="auth-user-bar">
          <div className="auth-user-info">
            <div className="auth-user-avatar">
              {(user.email?.[0] || "U").toUpperCase()}
            </div>

            <div>
              <strong>{user.email}</strong>
              <span>
                <span className="auth-online-dot" />
                AUTHENTICATED
              </span>
            </div>
          </div>

          <button
            type="button"
            className="auth-logout-button"
            onClick={logoutUser}
          >
            <LogIn size={15} />
            LOG OUT
          </button>
        </div>

        {children}
      </div>
    );
  }

  return (
    <div className="auth-screen">
      <div className="auth-grid" />

      <div className="auth-scan-line" />

      <div className="auth-glow auth-glow-one" />
      <div className="auth-glow auth-glow-two" />

      <div className="auth-layout">
        <div className="auth-side-content">
          <div className="auth-side-kicker">
            <span />
            SAGE-RF / SECURE NETWORK
          </div>

          <h1>
            Enter the
            <br />
            <span>signal layer.</span>
          </h1>

          <p>
            Access your RF intelligence environment,
            analyze recordings, inspect detections and
            operate the signal workstation.
          </p>

          <div className="auth-feature-list">
            <div>
              <Activity size={17} />
              <span>
                <strong>REAL-TIME DSP</strong>
                Signal processing pipeline
              </span>
            </div>

            <div>
              <Wifi size={17} />
              <span>
                <strong>SIGNAL INTELLIGENCE</strong>
                Frequency and modulation analysis
              </span>
            </div>

            <div>
              <ShieldCheck size={17} />
              <span>
                <strong>SECURE ACCESS</strong>
                Firebase authenticated workspace
              </span>
            </div>
          </div>
        </div>

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
              {mode === "login"
                ? "SECURE ACCESS"
                : "NEW OPERATOR"}
            </div>

            <h2>
              {mode === "login"
                ? "Welcome back."
                : "Create your account."}
            </h2>

            <p>
              {mode === "login"
                ? "Sign in to access your RF intelligence workstation."
                : "Create an account to access the SAGE-RF platform."}
            </p>
          </div>

          <form onSubmit={handleSubmit}>
            <label className="auth-field">
              <span>EMAIL ADDRESS</span>

              <input
                type="email"
                value={email}
                autoComplete="email"
                placeholder="operator@example.com"
                onChange={(event) => {
                  setEmail(event.target.value);
                  setError("");
                }}
              />
            </label>

            <label className="auth-field">
              <span>PASSWORD</span>

              <div className="auth-password-wrap">
                <input
                  type={showPassword ? "text" : "password"}
                  value={password}
                  autoComplete={
                    mode === "login"
                      ? "current-password"
                      : "new-password"
                  }
                  placeholder="Enter password"
                  onChange={(event) => {
                    setPassword(event.target.value);
                    setError("");
                  }}
                />

                <button
                  type="button"
                  className="auth-password-toggle"
                  onClick={() =>
                    setShowPassword((value) => !value)
                  }
                  aria-label={
                    showPassword
                      ? "Hide password"
                      : "Show password"
                  }
                >
                  {showPassword ? (
                    <EyeOff size={17} />
                  ) : (
                    <Eye size={17} />
                  )}
                </button>
              </div>
            </label>

            {mode === "register" && password && (
              <div className="auth-password-strength">
                <div>
                  <span>PASSWORD STRENGTH</span>
                  <strong>
                    {password.length >= 10
                      ? "STRONG"
                      : password.length >= 6
                      ? "ACCEPTABLE"
                      : "TOO SHORT"}
                  </strong>
                </div>

                <div className="auth-strength-track">
                  <span
                    style={{
                      width: `${
                        password.length >= 10
                          ? 100
                          : password.length >= 6
                          ? 60
                          : 25
                      }%`,
                    }}
                  />
                </div>
              </div>
            )}

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
                  SIGN IN TO SAGE-RF
                </>
              ) : (
                <>
                  <UserPlus size={17} />
                  CREATE OPERATOR ACCOUNT
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
                setPassword("");
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
            <ShieldCheck size={14} />

            <span>
              Firebase Authentication · Encrypted session
            </span>
          </div>

          <div className="auth-card-footer">
            <span>
              <span className="auth-online-dot" />
              AUTHENTICATION SERVICE
            </span>

            <strong>
              <Zap size={12} />
              ONLINE
            </strong>
          </div>
        </div>
      </div>
    </div>
  );
}
