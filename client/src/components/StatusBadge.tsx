const colors: Record<string, string> = {
  running: "bg-green-500",
  stopped: "bg-gray-500",
  error: "bg-red-500",
  unknown: "bg-yellow-500",
};

export default function StatusBadge({ status }: { status: string }) {
  const color = colors[status] || colors.unknown;
  return (
    <span className="inline-flex items-center gap-1.5 text-xs">
      <span className={`w-2 h-2 rounded-full ${color}`} />
      <span className="text-gray-400 capitalize">{status}</span>
    </span>
  );
}
