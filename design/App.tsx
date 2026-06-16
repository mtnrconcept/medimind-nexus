
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { ResearchPaper, MedicalSynthesis, ViewMode } from './types';
import { MOCK_PAPERS, Icons } from './constants';
import { researchSynthesisService } from './services/researchSynthesisService';
import DNAVisualizer from './components/DNAVisualizer';
import ResearchGrid from './components/ResearchGrid';
import AISynthesisPanel from './components/AISynthesisPanel';
import CursorDNA from './components/CursorDNA';

const App: React.FC = () => {
  const [query, setQuery] = useState('');
  const [papers, setPapers] = useState<ResearchPaper[]>(MOCK_PAPERS);
  const [synthesis, setSynthesis] = useState<MedicalSynthesis | null>(null);
  const [loading, setLoading] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>(ViewMode.GRID);
  const [activeTab, setActiveTab] = useState('trending');
  const [theme, setTheme] = useState<'dark' | 'light'>('dark');
  const scrollRef = useRef<number>(0);

  useEffect(() => {
    document.body.className = theme === 'light' ? 'light-theme' : '';
  }, [theme]);

  // Subtle parallax scroll effect
  useEffect(() => {
    const handleScroll = () => {
      scrollRef.current = window.scrollY;
      const parallaxBg = document.getElementById('parallax-bg');
      if (parallaxBg) {
        parallaxBg.style.transform = `translateY(${window.scrollY * 0.2}px)`;
      }
    };
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const toggleTheme = () => setTheme(prev => prev === 'dark' ? 'light' : 'dark');

  const handleSearch = useCallback(async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!query) return;

    setLoading(true);
    try {
      const result = await researchSynthesisService.synthesizeResearch(query, papers);
      setSynthesis(result);
    } catch (error) {
      console.error("Search failed", error);
    } finally {
      setLoading(false);
    }
  }, [query, papers]);

  return (
    <div className={`min-h-screen transition-colors duration-700 ${theme === 'dark' ? 'bg-[#020617] text-slate-200' : 'bg-[#fcfdfe] text-slate-900'}`}>
      <CursorDNA />

      {/* Parallax Background Ambience */}
      <div id="parallax-bg" className="fixed inset-0 pointer-events-none overflow-hidden z-0">
        <div className={`absolute top-0 right-0 w-[1000px] h-[1000px] blur-[140px] rounded-full -translate-y-1/2 translate-x-1/2 transition-colors duration-700 ${theme === 'dark' ? 'bg-cyan-500/10' : 'bg-cyan-400/20'}`} />
        <div className={`absolute bottom-0 left-0 w-[800px] h-[800px] blur-[120px] rounded-full translate-y-1/2 -translate-x-1/4 transition-colors duration-700 ${theme === 'dark' ? 'bg-indigo-600/10' : 'bg-indigo-400/15'}`} />
        
        {/* Floating background grids */}
        <div className={`absolute inset-0 opacity-[0.03] ${theme === 'dark' ? 'invert-0' : 'invert'}`} style={{ backgroundImage: 'radial-gradient(#22d3ee 1px, transparent 1px)', backgroundSize: '40px 40px' }} />
      </div>

      {/* Navigation */}
      <nav className={`fixed top-0 left-0 right-0 z-[100] border-b backdrop-blur-xl transition-all duration-700 ${theme === 'dark' ? 'border-white/10 bg-[#020617]/70' : 'border-slate-200 bg-white/70'}`}>
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className={`w-10 h-10 rounded-lg flex items-center justify-center transition-all shadow-lg ${theme === 'dark' ? 'bg-cyan-500 shadow-cyan-500/20' : 'bg-cyan-600 shadow-cyan-600/30'}`}>
              <span className="font-orbitron font-bold text-white text-xl">N</span>
            </div>
            <div>
              <h1 className="font-orbitron text-lg font-bold tracking-wider leading-none">NEXUS<span className="text-cyan-500">MED</span></h1>
              <span className={`text-[10px] font-mono tracking-widest uppercase ${theme === 'dark' ? 'text-cyan-500/60' : 'text-cyan-700/80'}`}>Node ID: BIO-8212</span>
            </div>
          </div>

          <div className="hidden md:flex items-center gap-8 text-[10px] font-orbitron uppercase tracking-[0.2em]">
            <button className={`${theme === 'dark' ? 'text-cyan-400' : 'text-cyan-600'} border-b-2 border-current pb-1`}>Archive</button>
            <button className={`${theme === 'dark' ? 'text-slate-400 hover:text-white' : 'text-slate-500 hover:text-slate-900'} transition-colors`}>Laboratories</button>
            <button className={`${theme === 'dark' ? 'text-slate-400 hover:text-white' : 'text-slate-500 hover:text-slate-900'} transition-colors`}>Visualizer</button>
            <button className={`${theme === 'dark' ? 'text-slate-400 hover:text-white' : 'text-slate-500 hover:text-slate-900'} transition-colors`}>Synthetics</button>
          </div>

          <div className="flex items-center gap-4">
            <button 
              onClick={toggleTheme}
              className={`group p-2.5 rounded-full border transition-all duration-500 ${theme === 'dark' ? 'border-white/10 bg-white/5 text-yellow-400 hover:bg-white/10' : 'border-slate-200 bg-slate-100 text-indigo-600 hover:bg-slate-200'}`}
              title="Shift Dimensional View"
            >
              <div className="transition-transform duration-500 group-hover:rotate-180">
                {theme === 'dark' ? (
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v2.25m6.364.386-1.591 1.591M21 12h-2.25m-.386 6.364-1.591-1.591M12 18.75V21m-4.773-4.227-1.591 1.591M3 12h2.25m.386-6.364 1.591-1.591M12 7.5a4.5 4.5 0 1 1 0 9 4.5 4.5 0 0 1 0-9Z" />
                  </svg>
                ) : (
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M21.752 15.002A9.72 9.72 0 0 1 18 15.75c-5.385 0-9.75-4.365-9.75-9.75 0-1.33.266-2.597.748-3.752A9.753 9.753 0 0 0 3 11.25C3 16.635 7.365 21 12.75 21a9.753 9.753 0 0 0 9.002-5.998Z" />
                  </svg>
                )}
              </div>
            </button>
            <div className="hidden sm:block text-right">
              <p className="text-[9px] text-slate-500 font-mono tracking-widest uppercase">Encryption Active</p>
              <p className={`text-[11px] font-mono font-bold ${theme === 'dark' ? 'text-green-400' : 'text-green-600'}`}>SYNCED</p>
            </div>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <main className="pt-24 pb-20 relative z-10">
        <div className="max-w-7xl mx-auto px-6">
          <div className="relative z-10 text-center mb-16">
            <DNAVisualizer />
            
            <div className="max-w-4xl mx-auto -mt-36">
              <h2 className="text-5xl md:text-7xl font-orbitron font-bold mb-8 tracking-tighter leading-[1.1]">
                DECODING THE <span className={`text-transparent bg-clip-text bg-gradient-to-r ${theme === 'dark' ? 'from-cyan-300 via-cyan-500 to-indigo-400' : 'from-cyan-600 via-indigo-600 to-indigo-800'}`}>GENOMIC FRONTIER</span>
              </h2>
              
              <form onSubmit={handleSearch} className="relative group max-w-2xl mx-auto">
                <div className={`absolute -inset-1 rounded-2xl blur-md opacity-25 group-focus-within:opacity-100 transition duration-700 bg-gradient-to-r ${theme === 'dark' ? 'from-cyan-500 to-indigo-500' : 'from-cyan-600 to-indigo-600'}`} />
                <div className={`relative flex items-center rounded-2xl border p-2 pl-6 transition-all duration-700 shadow-2xl ${theme === 'dark' ? 'bg-[#0f172a]/90 border-white/10' : 'bg-white/90 border-slate-200'}`}>
                  <div className={theme === 'dark' ? 'text-cyan-400' : 'text-cyan-600'}>
                    <Icons.Search />
                  </div>
                  <input 
                    type="text"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Search synthetic synapses, clinical trials, or nano-structures..."
                    className={`w-full bg-transparent border-none focus:ring-0 px-4 py-4 text-sm md:text-lg font-medium ${theme === 'dark' ? 'text-slate-100 placeholder:text-slate-600' : 'text-slate-900 placeholder:text-slate-400'}`}
                  />
                  <button 
                    type="submit"
                    disabled={loading}
                    className={`font-orbitron font-bold px-10 py-4 rounded-xl transition-all shadow-xl disabled:opacity-50 whitespace-nowrap active:scale-95 ${theme === 'dark' ? 'bg-cyan-500 hover:bg-cyan-400 text-[#020617] shadow-cyan-500/40' : 'bg-indigo-600 hover:bg-indigo-700 text-white shadow-indigo-600/40'}`}
                  >
                    {loading ? 'ANALYZING...' : 'INITIATE'}
                  </button>
                </div>
              </form>
            </div>
          </div>

          {/* Results Area */}
          <div className="flex flex-col lg:flex-row gap-10 mt-12">
            <div className="flex-1 space-y-8">
              <div className={`flex items-center justify-between glass-panel px-8 py-5 rounded-2xl border transition-all duration-700 ${theme === 'dark' ? 'border-white/5' : 'border-slate-200 shadow-sm'}`}>
                <div className="flex gap-8">
                  {['trending', 'latest', 'high-impact'].map(tab => (
                    <button 
                      key={tab}
                      onClick={() => setActiveTab(tab)}
                      className={`text-[10px] font-orbitron uppercase tracking-[0.2em] pb-1 transition-all relative ${activeTab === tab ? (theme === 'dark' ? 'text-cyan-400' : 'text-indigo-600') : 'text-slate-500 hover:text-slate-400'}`}
                    >
                      {tab}
                      {activeTab === tab && (
                        <span className={`absolute -bottom-1 left-0 right-0 h-0.5 rounded-full ${theme === 'dark' ? 'bg-cyan-400' : 'bg-indigo-600'}`} />
                      )}
                    </button>
                  ))}
                </div>
                <div className="flex items-center gap-4">
                  <button 
                    onClick={() => setViewMode(ViewMode.GRID)}
                    className={`p-2 rounded-lg transition-all ${viewMode === ViewMode.GRID ? (theme === 'dark' ? 'bg-cyan-500/20 text-cyan-400' : 'bg-indigo-100 text-indigo-700') : 'text-slate-500 hover:bg-slate-500/10'}`}
                  >
                    <Icons.Chart />
                  </button>
                  <button 
                    onClick={() => setViewMode(ViewMode.ANALYSIS)}
                    className={`p-2 rounded-lg transition-all ${viewMode === ViewMode.ANALYSIS ? (theme === 'dark' ? 'bg-cyan-500/20 text-cyan-400' : 'bg-indigo-100 text-indigo-700') : 'text-slate-500 hover:bg-slate-500/10'}`}
                  >
                    <Icons.Pulse />
                  </button>
                </div>
              </div>

              <ResearchGrid papers={papers} onSelect={(p) => console.log('Selected:', p)} />
            </div>

            {/* AI Side Panel */}
            <aside className="w-full lg:w-[400px] shrink-0 lg:h-[calc(100vh-140px)] lg:sticky lg:top-24">
              <AISynthesisPanel synthesis={synthesis} loading={loading} />
              {!synthesis && !loading && (
                <div className={`glass-panel rounded-2xl p-10 h-full flex flex-col items-center justify-center text-center transition-all duration-700 ${theme === 'dark' ? 'border-white/5' : 'border-slate-200 shadow-sm'}`}>
                  <div className={`w-24 h-24 rounded-full border-2 flex items-center justify-center mb-8 transition-all animate-pulse ${theme === 'dark' ? 'bg-slate-900/50 border-slate-800 text-cyan-500' : 'bg-slate-50 border-indigo-100 text-indigo-400'}`}>
                    <Icons.Brain />
                  </div>
                  <h3 className="font-orbitron text-xs uppercase tracking-[0.3em] text-slate-400 mb-3">AI Synthesis Engine</h3>
                  <p className="text-xs text-slate-500 leading-relaxed max-w-[240px]">Awaiting query input to generate clinical summaries and future research projections.</p>
                </div>
              )}
            </aside>
          </div>
        </div>
      </main>

      {/* Footer / Status Bar */}
      <footer className={`fixed bottom-0 left-0 right-0 z-[100] border-t px-8 py-3 backdrop-blur-xl transition-all duration-700 ${theme === 'dark' ? 'bg-[#020617]/90 border-white/5' : 'bg-white/90 border-slate-100'}`}>
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-10">
            <div className="flex items-center gap-3">
              <div className="w-1.5 h-1.5 rounded-full bg-green-500 shadow-[0_0_8px_#22c55e] animate-pulse" />
              <span className="text-[9px] font-orbitron text-slate-500 uppercase tracking-widest">Core Status: Optimal</span>
            </div>
            <div className="hidden sm:flex items-center gap-3 text-[9px] font-mono text-slate-500">
              <span className={theme === 'dark' ? 'text-cyan-500/50' : 'text-indigo-600/50'}>ENCRYPTION: AES-256-QUANTUM</span>
              <span className="opacity-30">|</span>
              <span>NETWORK: LIFI-V6</span>
            </div>
          </div>
          <div className="flex items-center gap-6 text-[9px] font-orbitron text-slate-500 uppercase tracking-widest">
            <span className="hidden md:inline">Global Health Index: 92.4%</span>
            <span>© 2024 NEXUSMED AI</span>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default App;
