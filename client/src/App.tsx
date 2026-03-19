import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { useState, useEffect, useCallback } from "react";
import { api } from "./api";
import Layout from "./components/Layout";
import Dashboard from "./pages/Dashboard";
import AgentDetail from "./pages/AgentDetail";
import AuditLog from "./pages/AuditLog";
import WorkflowList from "./pages/WorkflowList";
import WorkflowDetail from "./pages/WorkflowDetail";
import WorkflowRunView from "./pages/WorkflowRunView";

function LoginPage({ onLogin }: { onLogin: () => void }) {
  const [token, setToken] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      await api.login(token);
      onLogin();
    } catch {
      setError("Invalid token");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-950 flex items-center justify-center">
      <div className="bg-gray-900 border border-gray-800 rounded-lg p-8 w-full max-w-md">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-8 h-8 rounded bg-green-500" />
          <h1 className="text-xl font-bold text-white">AgentHub</h1>
        </div>
        <p className="text-gray-400 text-sm mb-6">
          Enter the access token from <code className="text-green-400">~/.agenthub/hub-token.json</code>
        </p>
        <form onSubmit={handleSubmit}>
          <input
            type="password"
            value={token}
            onChange={(e) => setToken(e.target.value)}
            placeholder="Access token"
            className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-white mb-4 focus:outline-none focus:border-green-500"
          />
          {error && <p className="text-red-400 text-sm mb-4">{error}</p>}
          <button
            type="submit"
            disabled={loading || !token}
            className="w-full bg-green-600 hover:bg-green-500 disabled:bg-gray-700 text-white rounded px-4 py-2 font-medium transition-colors"
          >
            {loading ? "Logging in..." : "Login"}
          </button>
        </form>
      </div>
    </div>
  );
}

export default function App() {
  const [authed, setAuthed] = useState<boolean | null>(null);

  const checkAuth = useCallback(async () => {
    try {
      await api.health();
      await api.listSandboxes();
      setAuthed(true);
    } catch {
      setAuthed(false);
    }
  }, []);

  useEffect(() => {
    checkAuth();
    const handler = () => setAuthed(false);
    window.addEventListener("hub:unauthorized", handler);
    return () => window.removeEventListener("hub:unauthorized", handler);
  }, [checkAuth]);

  if (authed === null) {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center">
        <div className="text-gray-400">Loading...</div>
      </div>
    );
  }

  if (!authed) {
    return <LoginPage onLogin={() => setAuthed(true)} />;
  }

  return (
    <BrowserRouter>
      <Layout onLogout={() => setAuthed(false)}>
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/agents/:name" element={<AgentDetail />} />
          <Route path="/workflows" element={<WorkflowList />} />
          <Route path="/workflows/:id" element={<WorkflowDetail />} />
          <Route path="/workflows/runs/:runId" element={<WorkflowRunView />} />
          <Route path="/audit" element={<AuditLog />} />
          <Route path="*" element={<Navigate to="/" />} />
        </Routes>
      </Layout>
    </BrowserRouter>
  );
}
