import { cn } from "@/lib/utils";

interface HolographicLoaderProps {
    className?: string;
    text?: string;
}

const HolographicLoader = ({ className, text = "Analyse cognitive en cours..." }: HolographicLoaderProps) => {
    return (
        <div className={cn("flex flex-col items-center justify-center p-8 relative overflow-hidden", className)}>
            {/* Container 3D effect */}
            <div className="relative w-32 h-32 flex items-center justify-center">

                {/* Outer Ring */}
                <div className="absolute inset-0 rounded-full border-[3px] border-transparent border-t-cyan-500 border-r-cyan-500/50 animate-[spin_3s_linear_infinite]"
                    style={{ boxShadow: "0 0 15px rgba(6,182,212,0.3)" }}></div>

                {/* Middle Ring - Counter rotating */}
                <div className="absolute inset-4 rounded-full border-[2px] border-transparent border-b-blue-500 border-l-blue-500/50 animate-[spin_2s_linear_infinite_reverse]"
                    style={{ boxShadow: "0 0 10px rgba(59,130,246,0.3)" }}></div>

                {/* Inner Ring */}
                <div className="absolute inset-8 rounded-full border-[2px] border-cyan-400/30 animate-pulse"></div>

                {/* Core */}
                <div className="absolute inset-0 flex items-center justify-center">
                    <div className="w-12 h-12 bg-cyan-500/10 rounded-full backdrop-blur-sm border border-cyan-500/30 flex items-center justify-center animate-pulse">
                        <div className="w-2 h-2 bg-cyan-400 rounded-full shadow-[0_0_10px_rgba(34,211,238,0.8)]"></div>
                    </div>
                </div>

                {/* Scanning Effect */}
                <div className="absolute inset-0 bg-gradient-to-b from-transparent via-cyan-500/10 to-transparent h-1/2 w-full animate-[scan_2s_ease-in-out_infinite]"
                    style={{ animation: "scan 2s ease-in-out infinite" }}></div>

                {/* Orbiting Particles */}
                <div className="absolute w-full h-full animate-[spin_4s_linear_infinite]">
                    <div className="absolute top-0 left-1/2 -translate-x-1/2 w-1.5 h-1.5 bg-cyan-300 rounded-full shadow-[0_0_8px_rgba(103,232,249,0.8)]"></div>
                </div>
            </div>

            {/* Text with Glitch/Tech effect */}
            <div className="mt-8 relative">
                <p className="text-cyan-500 font-mono text-sm tracking-wider uppercase animate-pulse">
                    {text}
                </p>
                <div className="absolute -bottom-1 left-0 w-full h-[1px] bg-gradient-to-r from-transparent via-cyan-500/50 to-transparent"></div>
            </div>

            {/* CSS for custom scan animation if needed (usually better in global css but inline here for portability) */}
            <style jsx>{`
        @keyframes scan {
          0%, 100% { transform: translateY(-100%); opacity: 0; }
          50% { transform: translateY(100%); opacity: 1; }
        }
      `}</style>
        </div>
    );
};

export default HolographicLoader;
