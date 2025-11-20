import React from 'react';
import { Mic2 } from 'lucide-react';

const Header: React.FC = () => {
  return (
    <header className="w-full py-6 px-8 flex items-center justify-between bg-transparent fixed top-0 z-50 backdrop-blur-sm border-b border-white/5">
      <div className="flex items-center gap-3">
        <div className="p-2 bg-gradient-to-tr from-brand-500 to-accent-500 rounded-xl shadow-lg shadow-brand-500/20">
          <Mic2 className="w-6 h-6 text-white" />
        </div>
        <div>
          <h1 className="text-2xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-white to-slate-400 tracking-tight">
            Singer Ai
          </h1>
          <p className="text-xs text-slate-400 font-medium tracking-wider uppercase">Vocal Production Studio</p>
        </div>
      </div>
      <div className="hidden md:flex gap-4">
        <span className="text-xs px-3 py-1 rounded-full bg-white/5 border border-white/10 text-slate-300">
          Powered by Gemini 2.5
        </span>
      </div>
    </header>
  );
};

export default Header;