
import React, { useState } from 'react';
import { ResearchPaper } from '../types';

interface ResearchGridProps {
  papers: ResearchPaper[];
  onSelect: (paper: ResearchPaper) => void;
}

const ResearchGrid: React.FC<ResearchGridProps> = ({ papers, onSelect }) => {
  const [hoveredId, setHoveredId] = useState<string | null>(null);

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>, id: string) => {
    const card = e.currentTarget;
    const rect = card.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    
    const centerX = rect.width / 2;
    const centerY = rect.height / 2;
    
    const rotateX = (y - centerY) / 10;
    const rotateY = (centerX - x) / 10;
    
    card.style.transform = `perspective(1000px) rotateX(${rotateX}deg) rotateY(${rotateY}deg) translateY(-8px)`;
  };

  const handleMouseLeave = (e: React.MouseEvent<HTMLDivElement>) => {
    e.currentTarget.style.transform = `perspective(1000px) rotateX(0deg) rotateY(0deg) translateY(0px)`;
    setHoveredId(null);
  };

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 p-6">
      {papers.map((paper, index) => (
        <div 
          key={paper.id}
          onMouseMove={(e) => handleMouseMove(e, paper.id)}
          onMouseLeave={handleMouseLeave}
          onMouseEnter={() => setHoveredId(paper.id)}
          onClick={() => onSelect(paper)}
          className="group relative glass-panel rounded-xl overflow-hidden cursor-pointer transition-transform duration-200 ease-out hover:hologram-glow z-10"
          style={{ 
            animationDelay: `${index * 100}ms`,
            willChange: 'transform'
          }}
        >
          <div className="scanline" />
          <div className="p-6">
            <div className="flex justify-between items-start mb-4">
              <span className="text-xs font-orbitron text-cyan-400 bg-cyan-950/50 px-2 py-1 rounded border border-cyan-500/30">
                RELEVANCE: {paper.relevance}%
              </span>
              <span className="text-[10px] text-slate-500 font-mono">#{paper.id}</span>
            </div>
            
            <h3 className="text-lg font-bold font-orbitron mb-2 group-hover:text-cyan-400 transition-colors">
              {paper.title}
            </h3>
            
            <p className="text-sm text-slate-400 mb-4 line-clamp-3">
              {paper.abstract}
            </p>
            
            <div className="flex flex-wrap gap-2 mb-4">
              {paper.tags.map(tag => (
                <span key={tag} className="text-[10px] uppercase tracking-wider text-indigo-400 px-2 py-0.5 bg-indigo-950/30 rounded border border-indigo-500/20">
                  {tag}
                </span>
              ))}
            </div>
            
            <div className="flex items-center justify-between border-t border-slate-800/50 pt-4 mt-auto">
              <div className="text-xs text-slate-500">
                <span className="block font-semibold text-slate-300 dark:text-slate-300 light-theme:text-slate-700">{paper.author}</span>
                <span>{paper.date}</span>
              </div>
              <div className="text-xs text-right text-slate-500">
                <span className="block font-semibold text-cyan-400">{paper.citations.toLocaleString()}</span>
                <span>Citations</span>
              </div>
            </div>
          </div>
          
          {/* Holographic light reflection */}
          <div className={`absolute inset-0 pointer-events-none opacity-0 group-hover:opacity-20 transition-opacity bg-gradient-to-br from-white via-transparent to-cyan-500/30`} />
          <div className="absolute bottom-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-cyan-500 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
        </div>
      ))}
    </div>
  );
};

export default ResearchGrid;
