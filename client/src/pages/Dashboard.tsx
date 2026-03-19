import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api";
import StatusBadge from "../components/StatusBadge";

interface Sandbox {
  name: string;
  model?: string;
  provider?: string;
  policies?: string[];
  createdAt?: string;
}

export default function Dashboard() {
  const [sandboxes, setSandboxes] = useState<Sandbox[]>([]);
  const [defaultSandbox, setDefaultSandbox] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.listSandboxes().then((data) => {
      setSandboxes(data.sandboxes);
      setDefaultSandbox(data.defaultSandbox);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  if (loading) {
    return <div className="text-gray-400">Loading sandboxes...</div>;
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Agents</h1>
        <span className="text-sm text-gray-500">{sandboxes.length} sandboxes</span>
      </div>

      {sandboxes.length === 0 ? (
        <div className="bg-gray-900 border border-gray-800 rounded-lg p-12 text-center">
          <p className="text-gray-400 mb-2">No sandboxes found</p>
          <p className="text-gray-600 text-sm">
            Run <code className="text-green-400">nemoclaw onboard</code> to create one.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {sandboxes.map((s) => (
            <Link
              key={s.name}
              to={`/agents/${s.name}`}
              className="bg-gray-900 border border-gray-800 rounded-lg p-4 hover:border-green-500/50 transition-colors group"
            >
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-semibold group-hover:text-green-400 transition-colors">
                  {s.name}
                </h3>
                {s.name === defaultSandbox && (
                  <span className="text-xs bg-green-600/20 text-green-400 px-2 py-0.5 rounded">
                    default
                  </span>
                )}
              </div>
              <StatusBadge status="running" />
              <div className="mt-3 space-y-1">
                {s.model && (
                  <p className="text-xs text-gray-500 truncate">
                    Model: <span className="text-gray-400">{s.model.split("/").pop()}</span>
                  </p>
                )}
                {s.provider && (
                  <p className="text-xs text-gray-500">
                    Provider: <span className="text-gray-400">{s.provider}</span>
                  </p>
                )}
                {s.policies && s.policies.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-2">
                    {s.policies.map((p) => (
                      <span
                        key={p}
                        className="text-xs bg-gray-800 text-gray-400 px-1.5 py-0.5 rounded"
                      >
                        {p}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
