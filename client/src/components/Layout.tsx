import { Link, useLocation } from "react-router-dom";
import { api } from "../api";
import type { ReactNode } from "react";

const nav = [
  { path: "/", label: "Agents" },
  { path: "/workflows", label: "Workflows" },
  { path: "/audit", label: "Audit Log" },
];

export default function Layout({
  children,
  onLogout,
}: {
  children: ReactNode;
  onLogout: () => void;
}) {
  const location = useLocation();

  const handleLogout = async () => {
    await api.logout();
    onLogout();
  };

  return (
    <div className="min-h-screen bg-gray-950 text-white flex">
      {/* Sidebar */}
      <aside className="w-56 bg-gray-900 border-r border-gray-800 flex flex-col">
        <div className="p-4 border-b border-gray-800 flex items-center gap-2">
          <div className="w-6 h-6 rounded bg-green-500" />
          <span className="font-bold text-sm">AgentHub</span>
        </div>
        <nav className="flex-1 p-2">
          {nav.map((item) => (
            <Link
              key={item.path}
              to={item.path}
              className={`block px-3 py-2 rounded text-sm mb-1 transition-colors ${
                location.pathname === item.path
                  ? "bg-green-600/20 text-green-400"
                  : "text-gray-400 hover:text-white hover:bg-gray-800"
              }`}
            >
              {item.label}
            </Link>
          ))}
        </nav>
        <div className="p-2 border-t border-gray-800">
          <button
            onClick={handleLogout}
            className="w-full text-left px-3 py-2 rounded text-sm text-gray-500 hover:text-red-400 hover:bg-gray-800 transition-colors"
          >
            Logout
          </button>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 p-6 overflow-auto">{children}</main>
    </div>
  );
}
