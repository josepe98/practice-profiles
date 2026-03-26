import React, { useState } from "react";
import { supabase } from "../supabaseClient.js";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);

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

  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100vh", background: "#f7fafc" }}>
      <div style={{ background: "#fff", padding: "40px 48px", borderRadius: 12, boxShadow: "0 4px 24px rgba(0,0,0,0.10)", width: 360 }}>
        <div style={{ textAlign: "center", marginBottom: 32 }}>
          <div style={{ width: 40, height: 40, borderRadius: "50%", background: "#00A94F", display: "inline-block", marginBottom: 12 }} />
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: "#1a202c" }}>Practice Profiles</h1>
          <p style={{ margin: "6px 0 0", fontSize: 13, color: "#718096" }}>Sign in to continue</p>
        </div>
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
              style={{ width: "100%", boxSizing: "border-box", padding: "8px 12px", border: "1px solid #cbd5e0", borderRadius: 6, fontSize: 14 }}
            />
          </div>
          <div style={{ marginBottom: 24 }}>
            <label style={{ display: "block", fontSize: 13, fontWeight: 500, color: "#4a5568", marginBottom: 4 }}>
              Password
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              style={{ width: "100%", boxSizing: "border-box", padding: "8px 12px", border: "1px solid #cbd5e0", borderRadius: 6, fontSize: 14 }}
            />
          </div>
          {error && (
            <div style={{ marginBottom: 16, padding: "8px 12px", background: "#fff5f5", border: "1px solid #fed7d7", borderRadius: 6, fontSize: 13, color: "#c53030" }}>
              {error}
            </div>
          )}
          <button
            type="submit"
            disabled={loading}
            style={{
              width: "100%",
              padding: "10px",
              background: loading ? "#a0aec0" : "#00A94F",
              color: "#fff",
              border: "none",
              borderRadius: 6,
              fontSize: 15,
              fontWeight: 600,
              cursor: loading ? "not-allowed" : "pointer",
            }}
          >
            {loading ? "Signing in…" : "Sign in"}
          </button>
        </form>
      </div>
    </div>
  );
}
