import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter, Routes, Route, NavLink, Navigate } from 'react-router-dom';
import './index.css';
import { Demo } from './pages/Demo';
import { Dashboard } from './pages/Dashboard';

function Shell({ children }: { children: React.ReactNode }) {
  const link = ({ isActive }: { isActive: boolean }) =>
    `px-3 py-1.5 rounded-md text-sm transition ${
      isActive
        ? 'bg-emerald-500/15 text-emerald-300'
        : 'text-slate-400 hover:text-slate-100'
    }`;

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <header className="border-b border-slate-800 bg-slate-950/90 backdrop-blur sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-6 py-3 flex items-center gap-6">
          <div className="font-semibold tracking-tight">
            <span className="text-emerald-400">Graph</span>RAG
            <span className="text-slate-600 font-normal ml-1">×</span>
            <span className="ml-1 text-sky-400">Wiki</span>
            <span className="ml-3 text-xs text-slate-600 font-normal">
              3-pipeline knowledge QA
            </span>
          </div>
          <nav className="flex gap-1">
            <NavLink to="/demo" className={link}>
              Live demo
            </NavLink>
            <NavLink to="/dashboard" className={link}>
              Benchmark
            </NavLink>
          </nav>
          <div className="ml-auto flex items-center gap-3">
            <span className="text-xs text-slate-600">TigerGraph Hackathon · 2026</span>
            <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-800/50">
              GraphRAG
            </span>
          </div>
        </div>
      </header>
      <main className="max-w-7xl mx-auto px-6 py-8">{children}</main>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter>
      <Shell>
        <Routes>
          <Route path="/" element={<Navigate to="/demo" replace />} />
          <Route path="/demo" element={<Demo />} />
          <Route path="/dashboard" element={<Dashboard />} />
        </Routes>
      </Shell>
    </BrowserRouter>
  </React.StrictMode>,
);
