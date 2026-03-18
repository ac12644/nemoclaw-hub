import { useEffect, useState, useCallback } from "react";
import { useParams, Link } from "react-router-dom";
import { api } from "../api";
import { useWebSocket } from "../hooks/useWebSocket";

type Tab = "chat" | "logs" | "config";

interface Message {
  id?: number;
  role: string;
  content: string;
  created_at?: string;
}

export default function AgentDetail() {
  const { name } = useParams<{ name: string }>();
  const [tab, setTab] = useState<Tab>("chat");
  const [sandbox, setSandbox] = useState<Record<string, unknown> | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [logs, setLogs] = useState<string[]>([]);
  const [policies, setPolicies] = useState<string[]>([]);
  const [allPresets, setAllPresets] = useState<
    Array<{ name: string; description: string; endpoints: string[] }>
  >([]);

  useEffect(() => {
    if (!name) return;
    api.getSandbox(name).then(setSandbox).catch(() => {});
    api.getMessages(name).then((d) => setMessages(d.messages)).catch(() => {});
    api.getSandboxPolicies(name).then((d) => setPolicies(d.policies)).catch(() => {});
    api.listPresets().then((d) => setAllPresets(d.presets)).catch(() => {});
  }, [name]);

  const handleLogMessage = useCallback((data: unknown) => {
    const msg = data as { type: string; line?: string };
    if (msg.type === "log" && msg.line) {
      setLogs((prev) => [...prev.slice(-500), msg.line!]);
    }
  }, []);

  const wsUrl = tab === "logs" && name ? `/api/sandboxes/${name}/logs/stream` : null;
  const { connected } = useWebSocket(wsUrl, handleLogMessage);

  const sendMessage = async () => {
    if (!name || !input.trim()) return;
    setSending(true);
    try {
      const res = await api.sendMessage(name, input);
      setMessages((prev) => [
        ...prev,
        { role: "user", content: res.user.content },
        { role: "assistant", content: res.assistant.content },
      ]);
      setInput("");
    } catch {
      /* handle error */
    } finally {
      setSending(false);
    }
  };

  const applyPreset = async (preset: string) => {
    if (!name) return;
    try {
      const res = await api.applyPreset(name, preset);
      setPolicies(res.applied);
    } catch {
      /* handle error */
    }
  };

  const tabs: { id: Tab; label: string }[] = [
    { id: "chat", label: "Chat" },
    { id: "logs", label: "Logs" },
    { id: "config", label: "Config" },
  ];

  return (
    <div className="h-full flex flex-col">
      <div className="flex items-center gap-4 mb-4">
        <Link to="/" className="text-gray-500 hover:text-white text-sm">
          &larr; Back
        </Link>
        <h1 className="text-xl font-bold">{name}</h1>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-4 border-b border-gray-800 pb-2">
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`px-4 py-1.5 rounded-t text-sm transition-colors ${
              tab === t.id
                ? "bg-gray-800 text-green-400"
                : "text-gray-500 hover:text-white"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Chat Tab */}
      {tab === "chat" && (
        <div className="flex-1 flex flex-col bg-gray-900 border border-gray-800 rounded-lg overflow-hidden">
          <div className="flex-1 overflow-auto p-4 space-y-3">
            {messages.length === 0 && (
              <p className="text-gray-600 text-sm text-center mt-8">
                No messages yet. Send a message to the agent.
              </p>
            )}
            {messages.map((m, i) => (
              <div
                key={i}
                className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}
              >
                <div
                  className={`max-w-[80%] rounded-lg px-3 py-2 text-sm ${
                    m.role === "user"
                      ? "bg-green-600/20 text-green-100"
                      : "bg-gray-800 text-gray-300"
                  }`}
                >
                  <pre className="whitespace-pre-wrap font-sans">{m.content}</pre>
                </div>
              </div>
            ))}
          </div>
          <div className="border-t border-gray-800 p-3 flex gap-2">
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && sendMessage()}
              placeholder="Send a message..."
              disabled={sending}
              className="flex-1 bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm text-white focus:outline-none focus:border-green-500"
            />
            <button
              onClick={sendMessage}
              disabled={sending || !input.trim()}
              className="bg-green-600 hover:bg-green-500 disabled:bg-gray-700 text-white rounded px-4 py-2 text-sm font-medium transition-colors"
            >
              {sending ? "..." : "Send"}
            </button>
          </div>
        </div>
      )}

      {/* Logs Tab */}
      {tab === "logs" && (
        <div className="flex-1 bg-gray-900 border border-gray-800 rounded-lg overflow-hidden flex flex-col">
          <div className="px-4 py-2 border-b border-gray-800 flex items-center gap-2 text-xs">
            <span className={`w-2 h-2 rounded-full ${connected ? "bg-green-500" : "bg-red-500"}`} />
            <span className="text-gray-500">{connected ? "Connected" : "Disconnected"}</span>
          </div>
          <div className="flex-1 overflow-auto p-4 font-mono text-xs text-gray-400">
            {logs.length === 0 && (
              <p className="text-gray-600">Waiting for log output...</p>
            )}
            {logs.map((line, i) => (
              <div key={i} className="py-0.5">{line}</div>
            ))}
          </div>
        </div>
      )}

      {/* Config Tab */}
      {tab === "config" && sandbox && (
        <div className="flex-1 overflow-auto space-y-4">
          {/* Sandbox Info */}
          <div className="bg-gray-900 border border-gray-800 rounded-lg p-4">
            <h3 className="text-sm font-semibold text-gray-300 mb-3">Sandbox</h3>
            <dl className="grid grid-cols-2 gap-2 text-sm">
              <dt className="text-gray-500">Model</dt>
              <dd className="text-gray-300">{String(sandbox.model || "—")}</dd>
              <dt className="text-gray-500">Provider</dt>
              <dd className="text-gray-300">{String(sandbox.provider || "—")}</dd>
              <dt className="text-gray-500">Created</dt>
              <dd className="text-gray-300">{String(sandbox.createdAt || "—")}</dd>
            </dl>
          </div>

          {/* Policies */}
          <div className="bg-gray-900 border border-gray-800 rounded-lg p-4">
            <h3 className="text-sm font-semibold text-gray-300 mb-3">Network Policy Presets</h3>
            <div className="space-y-2">
              {allPresets.map((p) => {
                const applied = policies.includes(p.name);
                return (
                  <div
                    key={p.name}
                    className="flex items-center justify-between bg-gray-800 rounded px-3 py-2"
                  >
                    <div>
                      <span className={`text-sm ${applied ? "text-green-400" : "text-gray-400"}`}>
                        {p.name}
                      </span>
                      <p className="text-xs text-gray-600">{p.description}</p>
                    </div>
                    {!applied && (
                      <button
                        onClick={() => applyPreset(p.name)}
                        className="text-xs bg-green-600/20 text-green-400 hover:bg-green-600/30 px-2 py-1 rounded transition-colors"
                      >
                        Apply
                      </button>
                    )}
                    {applied && (
                      <span className="text-xs text-green-500">Active</span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
