import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { api } from "../api";
import StatusBadge from "../components/StatusBadge";

interface Step {
  name: string;
  sandbox: string;
  prompt: string;
  timeout?: number;
  depends_on?: string | string[];
}

interface Run {
  id: string;
  status: string;
  trigger: string;
  started_at: string;
  completed_at: string | null;
  error: string | null;
}

export default function WorkflowDetail() {
  const { id } = useParams<{ id: string }>();
  const [workflow, setWorkflow] = useState<Record<string, unknown> | null>(null);
  const [steps, setSteps] = useState<Step[]>([]);
  const [runs, setRuns] = useState<Run[]>([]);
  const [yaml, setYaml] = useState("");
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!id) return;
    api.getWorkflow(id).then((d) => {
      setWorkflow(d);
      setYaml((d as { yaml_content: string }).yaml_content);
      setSteps(((d as { parsed: { steps: Step[] } }).parsed?.steps) || []);
    }).catch(() => {});
    api.listRuns(id).then((d) => setRuns(d.runs as Run[])).catch(() => {});
  }, [id]);

  const handleSave = async () => {
    if (!id) return;
    setError("");
    try {
      await api.updateWorkflow(id, yaml);
      setEditing(false);
      const d = await api.getWorkflow(id);
      setWorkflow(d);
      setSteps(((d as { parsed: { steps: Step[] } }).parsed?.steps) || []);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to save");
    }
  };

  const handleRun = async () => {
    if (!id) return;
    try {
      const { runId } = await api.triggerRun(id);
      const d = await api.listRuns(id);
      setRuns(d.runs as Run[]);
      window.location.href = `/workflows/runs/${runId}`;
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to trigger run");
    }
  };

  if (!workflow) return <div className="text-gray-400">Loading...</div>;

  return (
    <div>
      <div className="flex items-center gap-4 mb-6">
        <Link to="/workflows" className="text-gray-500 hover:text-white text-sm">&larr; Workflows</Link>
        <h1 className="text-xl font-bold">{(workflow as { name: string }).name}</h1>
        <button
          onClick={handleRun}
          className="ml-auto bg-green-600 hover:bg-green-500 text-white rounded px-4 py-2 text-sm font-medium"
        >
          Run Now
        </button>
      </div>

      {error && <p className="text-red-400 text-sm mb-4">{error}</p>}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
        {/* YAML Editor */}
        <div className="bg-gray-900 border border-gray-800 rounded-lg p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-gray-300">Definition</h3>
            {!editing ? (
              <button
                onClick={() => setEditing(true)}
                className="text-xs text-gray-500 hover:text-white"
              >
                Edit
              </button>
            ) : (
              <div className="flex gap-2">
                <button onClick={handleSave} className="text-xs bg-green-600 text-white px-2 py-1 rounded">Save</button>
                <button onClick={() => setEditing(false)} className="text-xs bg-gray-700 text-white px-2 py-1 rounded">Cancel</button>
              </div>
            )}
          </div>
          <textarea
            value={yaml}
            onChange={(e) => setYaml(e.target.value)}
            readOnly={!editing}
            rows={16}
            className={`w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm font-mono focus:outline-none ${
              editing ? "text-green-400 focus:border-green-500" : "text-gray-400"
            }`}
          />
        </div>

        {/* Step DAG */}
        <div className="bg-gray-900 border border-gray-800 rounded-lg p-4">
          <h3 className="text-sm font-semibold text-gray-300 mb-3">Steps ({steps.length})</h3>
          <div className="space-y-2">
            {steps.map((step, i) => {
              const deps = Array.isArray(step.depends_on) ? step.depends_on : step.depends_on ? [step.depends_on] : [];
              return (
                <div key={step.name}>
                  {i > 0 && deps.length > 0 && (
                    <div className="flex justify-center py-1">
                      <div className="w-px h-4 bg-gray-700" />
                    </div>
                  )}
                  <div className="bg-gray-800 rounded p-3">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium text-white">{step.name}</span>
                      <span className="text-xs text-gray-500">{step.sandbox}</span>
                    </div>
                    <p className="text-xs text-gray-500 mt-1 truncate">{step.prompt}</p>
                    {deps.length > 0 && (
                      <p className="text-xs text-gray-600 mt-1">depends on: {deps.join(", ")}</p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Run History */}
      <div className="bg-gray-900 border border-gray-800 rounded-lg overflow-hidden">
        <h3 className="text-sm font-semibold text-gray-300 px-4 py-3 border-b border-gray-800">
          Run History
        </h3>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-800 text-left text-gray-500">
              <th className="px-4 py-2 font-medium">Run ID</th>
              <th className="px-4 py-2 font-medium">Status</th>
              <th className="px-4 py-2 font-medium">Trigger</th>
              <th className="px-4 py-2 font-medium">Started</th>
            </tr>
          </thead>
          <tbody>
            {runs.length === 0 && (
              <tr><td colSpan={4} className="px-4 py-6 text-center text-gray-600">No runs yet</td></tr>
            )}
            {runs.map((r) => (
              <tr key={r.id} className="border-b border-gray-800/50 hover:bg-gray-800/50">
                <td className="px-4 py-2">
                  <Link to={`/workflows/runs/${r.id}`} className="text-green-400 hover:text-green-300 text-xs font-mono">
                    {r.id}
                  </Link>
                </td>
                <td className="px-4 py-2"><StatusBadge status={r.status} /></td>
                <td className="px-4 py-2 text-gray-500 text-xs">{r.trigger}</td>
                <td className="px-4 py-2 text-gray-500 text-xs">{new Date(r.started_at).toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
