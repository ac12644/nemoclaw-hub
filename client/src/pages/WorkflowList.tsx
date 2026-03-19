import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api";
import StatusBadge from "../components/StatusBadge";

interface Workflow {
  id: string;
  name: string;
  schedule: string | null;
  enabled: number;
  created_at: string;
  lastRun: { status: string; started_at: string } | null;
}

export default function WorkflowList() {
  const [workflows, setWorkflows] = useState<Workflow[]>([]);
  const [showCreate, setShowCreate] = useState(false);
  const [yaml, setYaml] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    api.listWorkflows().then((d) => setWorkflows(d.workflows as Workflow[])).catch(() => {});
  }, []);

  const handleCreate = async () => {
    setError("");
    try {
      await api.createWorkflow(yaml);
      setShowCreate(false);
      setYaml("");
      const d = await api.listWorkflows();
      setWorkflows(d.workflows as Workflow[]);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to create workflow");
    }
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Workflows</h1>
        <button
          onClick={() => setShowCreate(!showCreate)}
          className="bg-green-600 hover:bg-green-500 text-white rounded px-4 py-2 text-sm font-medium transition-colors"
        >
          New Workflow
        </button>
      </div>

      {showCreate && (
        <div className="bg-gray-900 border border-gray-800 rounded-lg p-4 mb-6">
          <h3 className="text-sm font-semibold text-gray-300 mb-2">Workflow YAML</h3>
          <textarea
            value={yaml}
            onChange={(e) => setYaml(e.target.value)}
            placeholder={`name: my-workflow\nschedule: "0 9 * * MON"\nsteps:\n  - name: step1\n    sandbox: my-agent\n    prompt: "Do something"`}
            rows={12}
            className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm text-green-400 font-mono focus:outline-none focus:border-green-500 mb-3"
          />
          {error && <p className="text-red-400 text-sm mb-3">{error}</p>}
          <div className="flex gap-2">
            <button
              onClick={handleCreate}
              disabled={!yaml.trim()}
              className="bg-green-600 hover:bg-green-500 disabled:bg-gray-700 text-white rounded px-4 py-2 text-sm"
            >
              Create
            </button>
            <button
              onClick={() => { setShowCreate(false); setError(""); }}
              className="bg-gray-700 hover:bg-gray-600 text-white rounded px-4 py-2 text-sm"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {workflows.length === 0 && !showCreate ? (
        <div className="bg-gray-900 border border-gray-800 rounded-lg p-12 text-center">
          <p className="text-gray-400 mb-2">No workflows yet</p>
          <p className="text-gray-600 text-sm">
            Create a YAML workflow to orchestrate multi-step agent tasks.
          </p>
        </div>
      ) : (
        <div className="bg-gray-900 border border-gray-800 rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-800 text-left text-gray-500">
                <th className="px-4 py-3 font-medium">Name</th>
                <th className="px-4 py-3 font-medium">Schedule</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium">Last Run</th>
                <th className="px-4 py-3 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {workflows.map((wf) => (
                <tr key={wf.id} className="border-b border-gray-800/50 hover:bg-gray-800/50">
                  <td className="px-4 py-3">
                    <Link to={`/workflows/${wf.id}`} className="text-green-400 hover:text-green-300">
                      {wf.name}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-gray-500 font-mono text-xs">
                    {wf.schedule || "manual"}
                  </td>
                  <td className="px-4 py-3">
                    {wf.enabled ? (
                      <span className="text-green-400 text-xs">enabled</span>
                    ) : (
                      <span className="text-gray-500 text-xs">disabled</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {wf.lastRun ? (
                      <StatusBadge status={wf.lastRun.status} />
                    ) : (
                      <span className="text-gray-600 text-xs">never</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <button
                      onClick={async () => {
                        await api.triggerRun(wf.id);
                        const d = await api.listWorkflows();
                        setWorkflows(d.workflows as Workflow[]);
                      }}
                      className="text-xs bg-gray-700 hover:bg-gray-600 text-white px-2 py-1 rounded"
                    >
                      Run
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
