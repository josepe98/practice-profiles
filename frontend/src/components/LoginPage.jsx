import React, { useState } from "react";
import { supabase } from "../supabaseClient.js";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);
  const [forgotMode, setForgotMode] = useState(false);
  const [resetSent, setResetSent] = useState(false);

  const handleLogin = async (e) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const { error: authError } = await supabase.auth.signInWithPassword({ email, password });
      if (authError) setError(authError.message);
    } finally {
      setLoading(false);
    }
  };

  const handleForgot = async (e) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const redirectTo = window.location.origin;
      const { error: resetError } = await supabase.auth.resetPasswordForEmail(email, { redirectTo });
      if (resetError) {
        setError(resetError.message);
      } else {
        setResetSent(true);
      }
    } finally {
      setLoading(false);
    }
  };

  const cardStyle = {
    background: "#fff",
    padding: "40px 48px",
    borderRadius: 12,
    boxShadow: "0 4px 24px rgba(0,0,0,0.10)",
    width: 360,
  };

  const inputStyle = {
    width: "100%",
    boxSizing: "border-box",
    padding: "8px 12px",
    border: "1px solid #cbd5e0",
    borderRadius: 6,
    fontSize: 14,
  };

  const btnStyle = (disabled) => ({
    width: "100%",
    padding: "10px",
    background: disabled ? "#a0aec0" : "#00A94F",
    color: "#fff",
    border: "none",
    borderRadius: 6,
    fontSize: 15,
    fontWeight: 600,
    cursor: disabled ? "not-allowed" : "pointer",
  });

  const header = (
    <div style={{ textAlign: "center", marginBottom: 32 }}>
      <div style={{ width: 40, height: 40, borderRadius: "50%", background: "#00A94F", display: "inline-block", marginBottom: 12 }} />
      <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: "#1a202c" }}>Practice Profiles</h1>
      <p style={{ margin: "6px 0 0", fontSize: 13, color: "#718096" }}>
        {forgotMode ? "Reset your password" : "Sign in to continue"}
      </p>
    </div>
  );

  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100vh", background: "#f7fafc" }}>
      <div style={cardStyle}>
        {header}

        {forgotMode ? (
          resetSent ? (
            <div style={{ textAlign: "center" }}>
              <p style={{ fontSize: 14, color: "#2d6a4f", marginBottom: 24 }}>
                Check your email for a password reset link.
              </p>
              <button
                onClick={() => { setForgotMode(false); setResetSent(false); }}
                style={{ background: "none", border: "none", color: "#00A94F", fontSize: 13, cursor: "pointer", fontWeight: 500 }}
              >
                Back to sign in
              </button>
            </div>
          ) : (
            <form onSubmit={handleForgot}>
              <div style={{ marginBottom: 24 }}>
                <label style={{ display: "block", fontSize: 13, fontWeight: 500, color: "#4a5568", marginBottom: 4 }}>
                  Email
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  autoFocus
                  style={inputStyle}
                />
              </div>
              {error && (
                <div style={{ marginBottom: 16, padding: "8px 12px", background: "#fff5f5", border: "1px solid #fed7d7", borderRadius: 6, fontSize: 13, color: "#c53030" }}>
                  {error}
                </div>
              )}
              <button type="submit" disabled={loading} style={btnStyle(loading)}>
                {loading ? "Sending…" : "Send reset link"}
              </button>
              <div style={{ textAlign: "center", marginTop: 16 }}>
                <button
                  type="button"
                  onClick={() => { setForgotMode(false); setError(null); }}
                  style={{ background: "none", border: "none", color: "#718096", fontSize: 13, cursor: "pointer" }}
                >
                  Back to sign in
                </button>
              </div>
            </form>
          )
        ) : (
          <form onSubmit={handleLogin}>
            <div style={{ marginBottom: 16 }}>
              <label style={{ display: "block", fontSize: 13, fontWeight: 500, color: "#4a5568", marginBottom: 4 }}>
                Email
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoFocus
                style={inputStyle}
              />
            </div>
            <div style={{ marginBottom: 8 }}>
              <label style={{ display: "block", fontSize: 13, fontWeight: 500, color: "#4a5568", marginBottom: 4 }}>
                Password
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                style={inputStyle}
              />
            </div>
            <div style={{ textAlign: "right", marginBottom: 20 }}>
              <button
                type="button"
                onClick={() => { setForgotMode(true); setError(null); }}
                style={{ background: "none", border: "none", color: "#718096", fontSize: 12, cursor: "pointer", padding: 0 }}
              >
                Forgot password?
              </button>
            </div>
            {error && (
              <div style={{ marginBottom: 16, padding: "8px 12px", background: "#fff5f5", border: "1px solid #fed7d7", borderRadius: 6, fontSize: 13, color: "#c53030" }}>
                {error}
              </div>
            )}
            <button type="submit" disabled={loading} style={btnStyle(loading)}>
              {loading ? "Signing in…" : "Sign in"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
