import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter, Routes, Route, NavLink, Navigate } from 'react-router-dom';
import './index.css';
import { Demo } from './pages/Demo';
import { Dashboard } from './pages/Dashboard';
import { CrmDashboard } from './pages/CrmDashboard';

function Shell({ children }: { children: React.ReactNode }) {
  const navLink = ({ isActive }: { isActive: boolean }) =>
    `px-3.5 py-1.5 rounded-lg text-sm font-medium transition-all duration-150 ${
      isActive
        ? 'bg-emerald-500/15 text-emerald-300 border border-emerald-700/40'
        : 'text-slate-400 hover:text-slate-100 border border-transparent'
    }`;

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      {/* ── Header ────────────────────────────────────────────────── */}
      <header className="border-b border-slate-800/80 bg-slate-950/95 backdrop-blur-xl sticky top-0 z-20">
        <div className="max-w-7xl mx-auto px-6 py-3 flex items-center gap-5">

          {/* Logo */}
          <div className="flex items-center gap-2 shrink-0">
            <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-emerald-400 to-teal-600 flex items-center justify-center text-slate-950 font-black text-xs">
              G
            </div>
            <div className="font-bold tracking-tight text-sm">
              <span className="text-emerald-400">Graph</span>
              <span className="text-white">RAG</span>
              <span className="text-slate-600 mx-1.5 font-normal">×</span>
              <span className="text-sky-400">CRM</span>
            </div>
          </div>

          {/* Dataset badge — the key selling point, always visible */}
          <div className="hidden lg:flex items-center gap-1 px-3 py-1.5 rounded-full bg-slate-900 border border-slate-700/60">
            <span className="text-[10px] text-slate-600 font-medium uppercase tracking-wider mr-1">Dataset:</span>
            <span className="text-emerald-400 text-xs font-bold">2.69M</span>
            <span className="text-slate-600 text-xs">tokens</span>
            <span className="text-slate-700 mx-1">·</span>
            <span className="text-sky-400 text-xs font-bold">21,318</span>
            <span className="text-slate-600 text-xs">entities</span>
            <span className="text-slate-700 mx-1">·</span>
            <span className="text-violet-400 text-xs font-bold">48,201</span>
            <span className="text-slate-600 text-xs">edges</span>
            <span className="text-slate-700 mx-1.5">·</span>
            <span className="text-[9px] font-bold uppercase tracking-wider text-amber-400 bg-amber-900/30 px-1.5 py-0.5 rounded-full border border-amber-800/50">
              10× min
            </span>
          </div>

          {/* Nav */}
          <nav className="flex gap-1 ml-1">
            <NavLink to="/crm-eval" className={navLink}>
              CRM Eval
            </NavLink>
            <NavLink to="/demo" className={navLink}>
              Live Demo
            </NavLink>
            <NavLink to="/dashboard" className={navLink}>
              Wiki Bench
            </NavLink>
          </nav>

          {/* Right side */}
          <div className="ml-auto flex items-center gap-3">
            <div className="hidden md:flex items-center gap-2 text-xs text-slate-600">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
              TigerGraph Hackathon 2026
            </div>
          </div>
        </div>
      </header>

      {/* ── Page content ──────────────────────────────────────────── */}
      <main className="max-w-7xl mx-auto px-6 py-8">{children}</main>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter>
      <Shell>
        <Routes>
          <Route path="/" element={<Navigate to="/crm-eval" replace />} />
          <Route path="/crm-eval" element={<CrmDashboard />} />
          <Route path="/demo" element={<Demo />} />
          <Route path="/dashboard" element={<Dashboard />} />
        </Routes>
      </Shell>
    </BrowserRouter>
  </React.StrictMode>,
);
