
import React from 'react';
import { MedicalSynthesis } from '../types';
import { Icons } from '../constants';

interface AISynthesisPanelProps {
  synthesis: MedicalSynthesis | null;
  loading: boolean;
}

const AISynthesisPanel: React.FC<AISynthesisPanelProps> = ({ synthesis, loading }) => {
  if (loading) {
    return (
      <div className="glass-panel rounded-xl p-8 h-full flex flex-col items-center justify-center space-y-4 animate-pulse">
        <div className="w-16 h-16 rounded-full border-4 border-cyan-500/20 border-t-cyan-500 animate-spin" />
        <p className="font-orbitron text-cyan-400 text-sm tracking-widest">ANALYZING BIODATA...</p>
      </div>
    );
  }

  if (!synthesis) return null;

  return (
    <div className="glass-panel rounded-xl p-8 h-full overflow-y-auto relative">
      <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-cyan-500 to-transparent" />
      <div className="flex items-center gap-3 mb-8">
        <div className="p-2 bg-cyan-950/50 rounded-lg border border-cyan-500/30 text-cyan-400">
          <Icons.Brain />
        </div>
        <h2 className="font-orbitron text-xl font-bold tracking-tight text-white uppercase">Clinical Synthesis</h2>
      </div>

      <div className="space-y-8">
        <section>
          <h3 className="text-xs font-orbitron text-cyan-400 mb-2 uppercase tracking-widest">Executive Summary</h3>
          <p className="text-slate-300 leading-relaxed text-sm">
            {synthesis.summary}
          </p>
        </section>

        <section>
          <h3 className="text-xs font-orbitron text-indigo-400 mb-3 uppercase tracking-widest">Core Insights</h3>
          <ul className="space-y-3">
            {synthesis.keyInsights.map((insight, idx) => (
              <li key={idx} className="flex gap-3 text-sm text-slate-400 items-start">
                <span className="text-cyan-500 font-mono mt-0.5">0{idx + 1}</span>
                {insight}
              </li>
            ))}
          </ul>
        </section>

        <section className="bg-cyan-950/20 p-4 rounded-lg border border-cyan-500/20">
          <h3 className="text-xs font-orbitron text-cyan-400 mb-2 uppercase tracking-widest">Clinical Relevance</h3>
          <p className="text-slate-300 text-sm italic">
            "{synthesis.clinicalSignificance}"
          </p>
        </section>

        <section>
          <h3 className="text-xs font-orbitron text-purple-400 mb-3 uppercase tracking-widest">Future Projections</h3>
          <div className="flex flex-wrap gap-2">
            {synthesis.futureDirections.map((dir, idx) => (
              <div key={idx} className="bg-slate-900 border border-slate-800 px-3 py-1.5 rounded-full text-[11px] text-slate-300">
                {dir}
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
};

export default AISynthesisPanel;
