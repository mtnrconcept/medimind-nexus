import React, { useEffect, useRef, useState } from 'react';

interface MatrixLoaderProps {
    progress?: number;
    status?: string;
    isActive: boolean;
}

export function MatrixLoader({ progress = 0, status = "Initialisation connect...", isActive }: MatrixLoaderProps) {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const [showStatus, setShowStatus] = useState(true);

    // Blink effect for status
    useEffect(() => {
        const interval = setInterval(() => {
            setShowStatus(prev => !prev);
        }, 500);
        return () => clearInterval(interval);
    }, []);

    useEffect(() => {
        if (!isActive || !canvasRef.current) return;

        const canvas = canvasRef.current;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        // Set canvas dimensions
        const resizeCanvas = () => {
            if (canvas.parentElement) {
                canvas.width = canvas.parentElement.clientWidth;
                canvas.height = canvas.parentElement.clientHeight || 300;
            }
        };
        resizeCanvas();
        window.addEventListener('resize', resizeCanvas);

        // Matrix characters
        const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789$@#%&*";
        const charArray = chars.split("");

        // Columns configuration
        const fontSize = 14;
        const columns = canvas.width / fontSize;
        const drops: number[] = [];

        // Initialize drops
        for (let i = 0; i < columns; i++) {
            drops[i] = Math.random() * -100; // Start above canvas randomly
        }

        const draw = () => {
            // Semi-transparent black background to create trail effect
            ctx.fillStyle = "rgba(0, 0, 0, 0.05)";
            ctx.fillRect(0, 0, canvas.width, canvas.height);

            ctx.fillStyle = "#0F0"; // Green text
            ctx.font = `${fontSize}px monospace`;

            for (let i = 0; i < drops.length; i++) {
                // Random character
                const text = charArray[Math.floor(Math.random() * charArray.length)];

                // Draw character
                // Varier l'opacité pour donner de la profondeur
                const opacity = Math.random() > 0.5 ? 1 : 0.5;
                ctx.fillStyle = `rgba(0, 255, 0, ${opacity})`;
                ctx.fillText(text, i * fontSize, drops[i] * fontSize);

                // Reset drop if it reaches bottom or randomly
                if (drops[i] * fontSize > canvas.height && Math.random() > 0.975) {
                    drops[i] = 0;
                }

                // Move drop down
                drops[i]++;
            }
        };

        const intervalId = setInterval(draw, 33);

        return () => {
            clearInterval(intervalId);
            window.removeEventListener('resize', resizeCanvas);
        };
    }, [isActive]);

    if (!isActive) return null;

    return (
        <div className="relative w-full h-64 overflow-hidden rounded-md border border-green-500/30 bg-black font-mono">
            <canvas ref={canvasRef} className="absolute inset-0 w-full h-full opacity-60" />

            <div className="absolute inset-0 flex flex-col items-center justify-center z-10 text-green-500 space-y-4 bg-black/40 backdrop-blur-sm">
                <div className="text-4xl font-bold tracking-widest animate-pulse">
                    {Math.round(progress)}%
                </div>

                <div className="w-2/3 h-2 bg-green-900/50 rounded-full overflow-hidden border border-green-500/30">
                    <div
                        className="h-full bg-green-500 shadow-[0_0_10px_#00ff00] transition-all duration-300 ease-out"
                        style={{ width: `${Math.max(2, progress)}%` }}
                    />
                </div>

                <div className="text-sm h-6 flex items-center">
                    <span className="mr-2 text-green-400">{'>'}</span>
                    <span className="typing-text">{status}</span>
                    <span className={`w-2 h-4 bg-green-500 ml-1 ${showStatus ? 'opacity-100' : 'opacity-0'}`}></span>
                </div>
            </div>

            {/* Scanlines overlay */}
            <div className="absolute inset-0 pointer-events-none bg-[linear-gradient(rgba(18,16,16,0)_50%,rgba(0,0,0,0.25)_50%),linear-gradient(90deg,rgba(255,0,0,0.06),rgba(0,255,0,0.02),rgba(0,0,255,0.06))] z-20 bg-[length:100%_2px,3px_100%] opacity-20"></div>
        </div>
    );
}
