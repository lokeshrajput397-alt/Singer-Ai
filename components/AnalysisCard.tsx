import React from 'react';
import { SongAnalysis } from '../types';
import { Music, Activity, Hash, MessageSquareQuote, Guitar, Layers } from 'lucide-react';

interface AnalysisCardProps {
  analysis: SongAnalysis | null;
  loading: boolean;
}

const AnalysisCard: React.FC<AnalysisCardProps> = ({ analysis, loading }) => {
  if (loading) {
    return (
      <div className="w-full p-6 bg-slate-900/50 border border-white/10 rounded-2xl animate-pulse">
        <div className="h-6 bg-slate-800 rounded w-1/3 mb-4"></div>
        <div className="grid grid-cols-2 gap-4">
          <div className="h-20 bg-slate-800 rounded"></div>
          <div className="h-20 bg-slate-800 rounded"></div>
        </div>
      </div>
    );
  }

  if (!analysis) return null;

  return (
    <div className="w-full bg-slate-900/50 border border-white/10 rounded-2xl overflow-hidden backdrop-blur-md shadow-2xl">
      <div className="p-6 border-b border-white/5 flex justify-between items-center">
        <h3 className="text-lg font-semibold text-white flex items-center gap-2">
          <Activity className="w-5 h-5 text-brand-500" />
          AI Sonic Analysis
        </h3>
        <span className="text-xs font-mono bg-brand-500/10 text-brand-400 px-2 py-1 rounded border border-brand-500/20">
          CONFIDENCE 98%
        </span>
      </div>
      
      <div className="p-6 grid grid-cols-2 md:grid-cols-4 gap-6">
        <div className="space-y-1">
          <p className="text-xs text-slate-400 uppercase tracking-wider font-semibold">Key</p>
          <p className="text-xl font-bold text-white flex items-center gap-2">
            <Hash className="w-4 h-4 text-slate-500" />
            {analysis.key}
          </p>
        </div>

        <div className="space-y-1">
          <p className="text-xs text-slate-400 uppercase tracking-wider font-semibold">BPM</p>
          <p className="text-xl font-bold text-white flex items-center gap-2">
            <Activity className="w-4 h-4 text-slate-500" />
            {analysis.bpm}
          </p>
        </div>

        <div className="space-y-1 col-span-2 md:col-span-2">
           <p className="text-xs text-slate-400 uppercase tracking-wider font-semibold">Style Profile</p>
           <div className="flex gap-2 flex-wrap mt-2">
             <span className="px-2.5 py-1 rounded-md bg-brand-500/20 text-brand-300 text-sm border border-brand-500/30 font-medium">
               {analysis.genre}
             </span>
             <span className="px-2.5 py-1 rounded-md bg-accent-500/20 text-accent-300 text-sm border border-accent-500/30 font-medium">
               {analysis.sentiment}
             </span>
           </div>
        </div>
      </div>
      
      {/* Instruments Section */}
      {analysis.instruments && analysis.instruments.length > 0 && (
        <div className="px-6 py-4 bg-black/20 border-y border-white/5">
          <p className="text-xs text-slate-400 uppercase tracking-wider mb-3 flex items-center gap-2 font-semibold">
            <Guitar className="w-3.5 h-3.5 text-indigo-400" />
            Identified Instruments
          </p>
          <div className="flex gap-2 flex-wrap">
            {analysis.instruments.map((inst, idx) => (
              <div key={idx} className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-slate-800 hover:bg-slate-700 transition-colors text-slate-200 text-xs border border-slate-600/50 shadow-sm group">
                <Layers className="w-3 h-3 text-slate-500 group-hover:text-brand-400 transition-colors" />
                {inst}
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="px-6 pb-6 space-y-4 mt-4">
        <div className="bg-gradient-to-br from-white/5 to-transparent p-4 rounded-xl border border-white/5">
          <p className="text-xs text-slate-400 uppercase tracking-wider mb-2 flex items-center gap-2 font-semibold">
            <Music className="w-3.5 h-3.5 text-emerald-400" /> 
            Production Suggestion
          </p>
          <p className="text-slate-300 text-sm leading-relaxed">
            {analysis.suggestion}
          </p>
        </div>

        <div className="bg-gradient-to-br from-white/5 to-transparent p-4 rounded-xl border border-white/5">
           <p className="text-xs text-slate-400 uppercase tracking-wider mb-2 flex items-center gap-2 font-semibold">
            <MessageSquareQuote className="w-3.5 h-3.5 text-amber-400" /> 
            Transcribed Lyrics
          </p>
          <p className="text-slate-400 text-sm italic font-serif">
            "{analysis.lyrics}"
          </p>
        </div>
      </div>
    </div>
  );
};

export default AnalysisCard;