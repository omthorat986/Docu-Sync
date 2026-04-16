import { useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";

const COLORS = ["#4F46E5", "#059669", "#DC2626", "#D97706", "#7C3AED", "#0891B2"];

function JoinScreen({ onJoin }) {
  const navigate = useNavigate();
  const location = useLocation();
  const [mode, setMode] = useState("login"); // 'login' | 'signup'
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [selectedColor, setSelectedColor] = useState(COLORS[0]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");

    if (!email.trim() || !password.trim()) {
      return setError("Email and Password are required");
    }

    if (mode === "signup" && !username.trim()) {
      return setError("Username is required for signup");
    }

    setLoading(true);

    try {
      const endpoint = mode === "signup" ? "/api/auth/signup" : "/api/auth/login";
      
      const payload = mode === "signup" 
        ? { username, email, password }
        : { email, password };

      const res = await fetch(`http://localhost:5001${endpoint}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Authentication failed");
      }

      if (mode === "signup") {
        setMode("login");
        setError("Signup successful! Please login.");
        setPassword("");
      } else {
        // Login success
        localStorage.setItem("docu-sync-token", data.token);
        
        onJoin({
          name: data.user.username,
          userId: data.user.id,
          token: data.token,
          color: selectedColor,
        });
        
        // Deep link redirection logic
        const from = location.state?.from || "/dashboard";
        navigate(from, { replace: true });
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="join-screen">
      <div className="join-card">
        <h1>DocuSync</h1>
        <p>Version-Controlled Collaborative Editor</p>

        {error && <div style={{ color: "#DC2626", marginBottom: "16px", fontWeight: "600", fontSize: "14px" }}>{error}</div>}

        <form onSubmit={handleSubmit} className="join-form">
          {mode === "signup" && (
            <>
              <label>Username</label>
              <input
                type="text"
                placeholder="Choose a username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
              />
            </>
          )}

          <label>Email Address</label>
          <input
            type="email"
            placeholder="Enter your email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />

          <label>Password</label>
          <input
            type="password"
            placeholder="Enter your password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />

          {mode === "login" && (
            <>
              <label>Select Session Color</label>
              <div className="color-row">
                {COLORS.map((color) => (
                  <button
                    key={color}
                    type="button"
                    className={`color-dot ${selectedColor === color ? "selected" : ""}`}
                    style={{ backgroundColor: color }}
                    onClick={() => setSelectedColor(color)}
                  />
                ))}
              </div>
            </>
          )}

          <button className="primary-btn" type="submit" disabled={loading}>
            {loading ? "Authenticating..." : mode === "login" ? "Login" : "Sign Up"}
          </button>
        </form>

        <div style={{ marginTop: "20px", textAlign: "center", fontSize: "14px" }}>
          {mode === "login" ? (
            <span>Don't have an account? <a href="#" onClick={(e) => { e.preventDefault(); setMode("signup"); setError(''); }}>Sign Up</a></span>
          ) : (
            <span>Already have an account? <a href="#" onClick={(e) => { e.preventDefault(); setMode("login"); setError(''); }}>Login</a></span>
          )}
        </div>
      </div>
    </div>
  );
}

export default JoinScreen;