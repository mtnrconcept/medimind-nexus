import React, { useEffect, useRef, useState, useCallback } from 'react';

const VIDEO_SOURCES = [
    '/video/Animationcharge.mp4',
];

export const VideoLoader: React.FC = () => {
    const videoRef = useRef<HTMLVideoElement>(null);
    // Single source, minimal state needed

    useEffect(() => {
        const video = videoRef.current;
        if (!video) return;
        video.currentTime = 0;
        video.play().catch(() => { });
    }, []);

    return (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-background/60 backdrop-blur-md transition-all duration-700 overflow-hidden">
            {/* Holographic Container */}
            <div className="relative w-full max-w-3xl aspect-video flex items-center justify-center isolate group">

                {/* Holographic Glow/Border */}
                <div className="absolute inset-0 rounded-xl border border-cyan-500/30 shadow-[0_0_30px_rgba(0,255,255,0.15),inset_0_0_20px_rgba(0,255,255,0.1)] z-20 pointer-events-none"></div>

                {/* Scanlines Overlay */}
                <div
                    className="absolute inset-0 rounded-xl z-20 pointer-events-none opacity-30"
                    style={{
                        backgroundImage:
                            'repeating-linear-gradient(transparent 0px, transparent 2px, rgba(0, 255, 255, 0.2) 3px)',
                    }}
                />

                {/* Vertical Scanner Bar */}
                <div className="absolute left-0 w-full h-1 bg-cyan-400/50 shadow-[0_0_10px_rgba(0,255,255,0.8)] z-30 animate-scan" />

                {/* Glitch Effect Layers (Red/Cyan Offset) */}
                <div className="absolute inset-0 rounded-xl overflow-hidden z-10 mix-blend-screen opacity-0 animate-glitch-1">
                    <div className="w-full h-full bg-red-500/20 translate-x-1" />
                </div>
                <div className="absolute inset-0 rounded-xl overflow-hidden z-10 mix-blend-screen opacity-0 animate-glitch-2">
                    <div className="w-full h-full bg-blue-500/20 -translate-x-1" />
                </div>

                {/* Main Video */}
                <video
                    ref={videoRef}
                    src={VIDEO_SOURCES[0]}
                    muted
                    playsInline
                    autoPlay
                    loop
                    className="w-full h-full object-cover rounded-xl opacity-90 transition-transform duration-700"
                    style={{
                        maskImage: 'radial-gradient(circle at center, black 50%, transparent 95%)',
                        WebkitMaskImage: 'radial-gradient(circle at center, black 50%, transparent 95%)',
                        willChange: 'transform, opacity',
                        transform: 'translateZ(0)',
                        filter:
                            'contrast(1.2) brightness(1.1) drop-shadow(0 0 10px rgba(0,255,255,0.3))',
                    }}
                />

                {/* Tech UI Corners */}
                <div className="absolute top-0 left-0 w-4 h-4 border-t-2 border-l-2 border-cyan-500 z-30" />
                <div className="absolute top-0 right-0 w-4 h-4 border-t-2 border-r-2 border-cyan-500 z-30" />
                <div className="absolute bottom-0 left-0 w-4 h-4 border-b-2 border-l-2 border-cyan-500 z-30" />
                <div className="absolute bottom-0 right-0 w-4 h-4 border-b-2 border-r-2 border-cyan-500 z-30" />

                {/* Status Text */}
                <div className="absolute bottom-6 left-1/2 -translate-x-1/2 text-center space-y-1 z-30">
                    <div className="text-cyan-400 font-mono text-xs tracking-[0.3em] uppercase animate-pulse drop-shadow-[0_0_5px_rgba(0,255,255,0.8)]">
                        Initialisation Holographique
                    </div>
                </div>
            </div>

            <style>{`
                @keyframes scan {
                    0% { top: 0%; opacity: 0; }
                    10% { opacity: 1; }
                    90% { opacity: 1; }
                    100% { top: 100%; opacity: 0; }
                }
                .animate-scan {
                    animation: scan 3s linear infinite;
                }
                @keyframes glitch-1 {
                    0% { opacity: 0; transform: translateX(0); }
                    2% { opacity: 0.8; transform: translateX(-2px); }
                    4% { opacity: 0; transform: translateX(0); }
                    95% { opacity: 0; }
                    97% { opacity: 0.8; transform: translateX(2px); }
                    100% { opacity: 0; }
                }
                .animate-glitch-1 {
                    animation: glitch-1 4s infinite linear alternate-reverse;
                }
                @keyframes glitch-2 {
                    0% { opacity: 0; transform: translateX(0); }
                    1% { opacity: 0.7; transform: translateX(2px); }
                    3% { opacity: 0; transform: translateX(0); }
                    92% { opacity: 0; }
                    94% { opacity: 0.7; transform: translateX(-2px); }
                    100% { opacity: 0; }
                }
                .animate-glitch-2 {
                    animation: glitch-2 2.5s infinite linear alternate-reverse;
                }
            `}</style>
        </div>
    );
};
