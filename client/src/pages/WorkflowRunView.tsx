import { useEffect, useState, useCallback } from "react";
import { useParams, Link } from "react-router-dom";
import { api } from "../api";
import { useWebSocket } from "../hooks/useWebSocket";
import StatusBadge from "../components/StatusBadge";

interface StepRun {
  id: string;
  step_name: string;
  status: string;
  output: string | null;
  started_at: string | null;
  completed_at: string | null;
  error: string | null;
}

interface Run {
  id: string;
  workflow_id: string;
  status: string;
  trigger: string;
  started_at: string;
  completed_at: string | null;
  error: string | null;
}

export default function WorkflowRunView() {
  const { runId } = useParams<{ runId: string }>();
  const [run, setRun] = useState<Run | null>(null);
  const [steps, setSteps] = useState<StepRun[]>([]);

  useEffect(() => {
    if (!runId) return;
    api.getRun(runId).then((d) => {
      setRun(d.run as Run);
      setSteps(d.steps as StepRun[]);
    }).catch(() => {});
  }, [runId]);

  const handleWsMessage = useCallback((data: unknown) => {
    const msg = data as { type: string; run?: Run; steps?: StepRun[] };
    if (msg.type === "workflow_update") {
      if (msg.run) setRun(msg.run);
      if (msg.steps) setSteps(msg.steps);
    }
  }, []);

  const wsUrl = runId ? `/api/workflows/runs/${runId}/stream` : null;
  useWebSocket(wsUrl, handleWsMessage);

  if (!run) return <div className="text-gray-400">Loading...</div>;

  const statusColors: Record<string, string> = {
    pending: "border-gray-700",
    running: "border-blue-500 bg-blue-500/5",
    completed: "border-green-500/50",
    failed: "border-red-500/50 bg-red-500/5",
    skipped: "border-gray-800 opacity-50",
  };

  return (
    <div>
      <div className="flex items-center gap-4 mb-6">
        <Link to={`/workflows/${run.workflow_id}`} className="text-gray-500 hover:text-white text-sm">
          &larr; Workflow
        </Link>
        <h1 className="text-xl font-bold font-mono">{run.id}</h1>
        <StatusBadge status={run.status} />
      </div>

      {run.error && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-lg px-4 py-3 mb-6 text-sm text-red-300">
          {run.error}
        </div>
      )}

      <div className="space-y-3">
        {steps.map((step, i) => (
          <div key={step.id}>
            {i > 0 && (
              <div className="flex justify-center py-1">
                <div className={`w-px h-6 ${step.status === "completed" ? "bg-green-500/50" : "bg-gray-700"}`} />
              </div>
            )}
            <div className={`bg-gray-900 border rounded-lg p-4 ${statusColors[step.status] || "border-gray-800"}`}>
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-3">
                  <span className="text-sm font-medium text-white">{step.step_name}</span>
                  <StatusBadge status={step.status} />
                </div>
                {step.started_at && step.completed_at && (
                  <span className="text-xs text-gray-500">
                    {((new Date(step.completed_at).getTime() - new Date(step.started_at).getTime()) / 1000).toFixed(1)}s
                  </span>
                )}
                {step.status === "running" && (
                  <span className="text-xs text-blue-400 animate-pulse">running...</span>
                )}
              </div>

              {step.error && (
                <div className="bg-red-500/10 rounded px-3 py-2 text-xs text-red-300 mt-2">
                  {step.error}
                </div>
              )}

              {step.output && (
                <div className="bg-gray-800 rounded px-3 py-2 mt-2 text-xs text-gray-400 font-mono max-h-40 overflow-auto whitespace-pre-wrap">
                  {step.output}
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
