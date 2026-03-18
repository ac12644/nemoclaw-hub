import { useEffect, useState, useCallback } from "react";
import { api } from "../api";
import { useWebSocket } from "../hooks/useWebSocket";

interface AuditEvent {
  id: number;
  sandbox: string | null;
  event_type: string;
  detail: string | null;
  created_at: string;
}

const typeColors: Record<string, string> = {
  "sandbox.created": "text-green-400",
  "sandbox.destroyed": "text-red-400",
  "policy.applied": "text-blue-400",
  "credential.updated": "text-yellow-400",
  "message.sent": "text-gray-400",
};

export default function AuditLog() {
  const [events, setEvents] = useState<AuditEvent[]>([]);
  const [filter, setFilter] = useState("");

  useEffect(() => {
    api.getAudit({ limit: 100 }).then((d) => setEvents(d.events)).catch(() => {});
  }, []);

  const handleActivity = useCallback((data: unknown) => {
    const msg = data as { type: string; event?: AuditEvent };
    if (msg.type === "audit" && msg.event) {
      setEvents((prev) => [msg.event!, ...prev].slice(0, 200));
    }
  }, []);

  useWebSocket("/api/activity", handleActivity);

  const filtered = filter
    ? events.filter(
        (e) =>
          e.event_type.includes(filter) ||
          e.sandbox?.includes(filter) ||
          e.detail?.includes(filter)
      )
    : events;

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Audit Log</h1>
        <input
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="Filter events..."
          className="bg-gray-800 border border-gray-700 rounded px-3 py-1.5 text-sm text-white w-64 focus:outline-none focus:border-green-500"
        />
      </div>

      <div className="bg-gray-900 border border-gray-800 rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-800 text-left text-gray-500">
              <th className="px-4 py-3 font-medium">Time</th>
              <th className="px-4 py-3 font-medium">Sandbox</th>
              <th className="px-4 py-3 font-medium">Event</th>
              <th className="px-4 py-3 font-medium">Detail</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && (
              <tr>
                <td colSpan={4} className="px-4 py-8 text-center text-gray-600">
                  No events found
                </td>
              </tr>
            )}
            {filtered.map((e) => (
              <tr key={e.id} className="border-b border-gray-800/50 hover:bg-gray-800/50">
                <td className="px-4 py-2 text-gray-500 whitespace-nowrap text-xs">
                  {new Date(e.created_at).toLocaleString()}
                </td>
                <td className="px-4 py-2 text-gray-400">{e.sandbox || "—"}</td>
                <td className="px-4 py-2">
                  <span className={typeColors[e.event_type] || "text-gray-400"}>
                    {e.event_type}
                  </span>
                </td>
                <td className="px-4 py-2 text-gray-500 text-xs truncate max-w-xs">
                  {e.detail || "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
