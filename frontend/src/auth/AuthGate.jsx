import { useEffect, useState } from "react";
import {
  ArrowRight,
  LockKeyhole,
  Mail,
  Radio,
  ShieldCheck,
  UserRound,
} from "lucide-react";

const SESSION_KEY = "sage_rf_session";

const emptyForm = {
  name: "",
  email: "",
  password: "",
};

function getStoredSession() {
  try {
    const raw = localStorage.getItem(SESSION_KEY);

    if (!raw) return null;

    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function AuthCard({ onAuthenticated }) {
  const [mode, setMode] = useState("login");
  const [form, setForm] = useState(emptyForm);
  const [step, setStep] = useState("credentials");
  const [otp, setOtp] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  function updateField(event) {
    const { name, value } = event.target;

    setForm((previous) => ({
      ...previous,
      [name]: value,
    }));

    setError("");
    setMessage("");
  }

  function switchMode(nextMode) {
    setMode(nextMode);
    setStep("credentials");
    setOtp("");
    setForm(emptyForm);
    setError("");
    setMessage("");
  }

  function submitCredentials(event) {
    event.preventDefault();

    setError("");
    setMessage("");

    if (!form.email.trim() || !form.password.trim()) {
      setError("Email and password are required.");
      return;
    }

    if (mode === "signup" && !form.name.trim()) {
      setError("Your name is required.");
      return;
    }

    if (form.password.length < 6) {
      setError("Password must contain at least 6 characters.");
      return;
    }

    setLoading(true);

    window.setTimeout(() => {
      setLoading(false);
      setStep("otp");

      setMessage(
        "Development mode: enter 123456 to verify this account."
      );
    }, 500);
  }

  function verifyOtp(event) {
    event.preventDefault();

    setError("");
    setMessage("");

    if (otp !== "123456") {
      setError("Invalid OTP. Use 123456 in development mode.");
      return;
    }

    const session = {
      id: `usr_${Date.now()}`,
      name:
        form.name.trim() ||
        form.email.split("@")[0] ||
        "SAGE-RF User",
      email: form.email.trim().toLowerCase(),
      authenticatedAt: new Date().toISOString(),
    };

    localStorage.setItem(
      SESSION_KEY,
      JSON.stringify(session)
    );

    onAuthenticated(session);
  }

  return (
    <main className="sage-auth-page">
      <div className="sage-auth-background">
        <div className="sage-auth-grid" />
        <div className="sage-auth-orb sage-auth-orb-one" />
        <div className="sage-auth-orb sage-auth-orb-two" />
      </div>

      <section className="sage-auth-card">
        <div className="sage-auth-brand">
          <div className="sage-auth-logo">
            <Radio size={21} />
          </div>

          <div>
            <strong>SAGE-RF</strong>
            <span>RADIO FREQUENCY ANALYSIS</span>
          </div>
        </div>

        <div className="sage-auth-heading">
          <span className="sage-auth-kicker">
            SECURE ACCESS
          </span>

          <h1>
            {step === "otp"
              ? "Verify your identity"
              : mode === "login"
                ? "Welcome back"
                : "Create your account"}
          </h1>

          <p>
            {step === "otp"
              ? "Enter the verification code to continue to your RF workstation."
              : "Access your signal analysis workspace and saved investigations."}
          </p>
        </div>

        {step === "credentials" ? (
          <form
            className="sage-auth-form"
            onSubmit={submitCredentials}
          >
            {mode === "signup" && (
              <label>
                <span>FULL NAME</span>

                <div className="sage-auth-input">
                  <UserRound size={17} />

                  <input
                    name="name"
                    value={form.name}
                    onChange={updateField}
                    placeholder="Your name"
                    autoComplete="name"
                  />
                </div>
              </label>
            )}

            <label>
              <span>EMAIL ADDRESS</span>

              <div className="sage-auth-input">
                <Mail size={17} />

                <input
                  name="email"
                  type="email"
                  value={form.email}
                  onChange={updateField}
                  placeholder="you@example.com"
                  autoComplete="email"
                />
              </div>
            </label>

            <label>
              <span>PASSWORD</span>

              <div className="sage-auth-input">
                <LockKeyhole size={17} />

                <input
                  name="password"
                  type="password"
                  value={form.password}
                  onChange={updateField}
                  placeholder="Minimum 6 characters"
                  autoComplete={
                    mode === "login"
                      ? "current-password"
                      : "new-password"
                  }
                />
              </div>
            </label>

            {error && (
              <div className="sage-auth-message error">
                {error}
              </div>
            )}

            {message && (
              <div className="sage-auth-message">
                {message}
              </div>
            )}

            <button
              className="sage-auth-submit"
              type="submit"
              disabled={loading}
            >
              {loading
                ? "INITIALIZING..."
                : mode === "login"
                  ? "CONTINUE TO SAGE-RF"
                  : "CREATE SAGE-RF ACCOUNT"}

              {!loading && <ArrowRight size={17} />}
            </button>
          </form>
        ) : (
          <form
            className="sage-auth-form"
            onSubmit={verifyOtp}
          >
            <div className="sage-auth-otp-icon">
              <ShieldCheck size={25} />
            </div>

            <label>
              <span>VERIFICATION CODE</span>

              <div className="sage-auth-input sage-auth-otp-input">
                <input
                  value={otp}
                  onChange={(event) =>
                    setOtp(
                      event.target.value
                        .replace(/\D/g, "")
                        .slice(0, 6)
                    )
                  }
                  inputMode="numeric"
                  maxLength={6}
                  placeholder="000000"
                  autoComplete="one-time-code"
                  autoFocus
                />
              </div>
            </label>

            {error && (
              <div className="sage-auth-message error">
                {error}
              </div>
            )}

            {message && (
              <div className="sage-auth-message">
                {message}
              </div>
            )}

            <button
              className="sage-auth-submit"
              type="submit"
            >
              VERIFY & ENTER
              <ArrowRight size={17} />
            </button>

            <button
              className="sage-auth-secondary"
              type="button"
              onClick={() => {
                setStep("credentials");
                setOtp("");
                setError("");
                setMessage("");
              }}
            >
              BACK TO SIGN IN
            </button>
          </form>
        )}

        {step === "credentials" && (
          <div className="sage-auth-switch">
            <span>
              {mode === "login"
                ? "New to SAGE-RF?"
                : "Already have an account?"}
            </span>

            <button
              type="button"
              onClick={() =>
                switchMode(
                  mode === "login"
                    ? "signup"
                    : "login"
                )
              }
            >
              {mode === "login"
                ? "CREATE ACCOUNT"
                : "SIGN IN"}
            </button>
          </div>
        )}

        <div className="sage-auth-footer">
          <ShieldCheck size={14} />
          <span>
            Secure RF analysis environment
          </span>
        </div>
      </section>
    </main>
  );
}

export default function AuthGate({
  children,
}) {
  const [session, setSession] = useState(
    getStoredSession
  );

  useEffect(() => {
    const stored = getStoredSession();

    if (stored) {
      setSession(stored);
    }
  }, []);

  if (!session) {
    return (
      <AuthCard
        onAuthenticated={setSession}
      />
    );
  }

  return children({
    session,
    logout() {
      localStorage.removeItem(SESSION_KEY);
      setSession(null);
    },
  });
}