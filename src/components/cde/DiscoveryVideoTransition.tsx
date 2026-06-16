import { useEffect, useState, useRef } from 'react';
import { X } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface DiscoveryVideoTransitionProps {
    isOpen: boolean;
    fromRect: DOMRect | null;
    onClose: () => void;
    onVideoEnd: () => void;
}

const DiscoveryVideoTransition = ({ isOpen, fromRect, onClose, onVideoEnd }: DiscoveryVideoTransitionProps) => {
    const [isAnimating, setIsAnimating] = useState(false);
    const [isExpanded, setIsExpanded] = useState(false);
    const [videoUnavailable, setVideoUnavailable] = useState(false);
    const videoRef = useRef<HTMLVideoElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (isOpen && fromRect) {
            // Initial state: positioned at button
            setIsAnimating(true);
            setIsExpanded(false);
            setVideoUnavailable(false);

            // Force reflow
            requestAnimationFrame(() => {
                // Trigger animation to expanded state
                setIsExpanded(true);

                // Play video
                if (videoRef.current) {
                    videoRef.current.currentTime = 0;
                    videoRef.current.play().catch(() => {
                        setVideoUnavailable(true);
                    });
                }

                // Finish animation state after transition
                setTimeout(() => {
                    setIsAnimating(false);
                }, 800); // 800ms transition
            });
        } else {
            setIsExpanded(false);
        }
    }, [isOpen, fromRect]);

    if (!isOpen) return null;

    return (
        <div
            className={`fixed z-[100] transition-all duration-700 ease-smooth-out ${isExpanded
                    ? 'inset-0 bg-black/90 backdrop-blur-sm flex items-center justify-center p-4'
                    : ''
                }`}
            style={!isExpanded && fromRect ? {
                top: fromRect.top,
                left: fromRect.left,
                width: fromRect.width,
                height: fromRect.height,
                position: 'fixed'
            } : {}}
        >
            <div
                className={`relative overflow-hidden transition-all duration-700 ease-smooth-out shadow-2xl ${isExpanded
                        ? 'w-full max-w-5xl aspect-video rounded-xl bg-black'
                        : 'w-full h-full rounded-md bg-transparent'
                    }`}
            >
                {videoUnavailable ? (
                    <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-violet-950 via-slate-950 to-cyan-950">
                        <div className="absolute inset-0 opacity-40">
                            <div className="absolute left-1/4 top-1/4 h-32 w-32 rounded-full border border-cyan-300/40" />
                            <div className="absolute right-1/4 bottom-1/4 h-48 w-48 rounded-full border border-violet-300/30" />
                            <div className="absolute left-1/2 top-1/2 h-64 w-64 -translate-x-1/2 -translate-y-1/2 rounded-full border border-white/10" />
                        </div>
                        <div className="relative text-center text-white">
                            <p className="text-sm uppercase tracking-[0.35em] text-cyan-200">Discovery Engine</p>
                            <p className="mt-3 text-3xl font-semibold">Analyse en cours</p>
                        </div>
                    </div>
                ) : (
                    <video
                        ref={videoRef}
                        className="w-full h-full object-cover"
                        src="/video/discovery.mp4"
                        autoPlay
                        muted
                        playsInline
                        onError={() => setVideoUnavailable(true)}
                        onEnded={onVideoEnd}
                    />
                )}

                {isExpanded && (
                    <Button
                        size="icon"
                        variant="ghost"
                        className="absolute top-4 right-4 text-white hover:bg-white/20 rounded-full"
                        aria-label="Fermer la transition"
                        title="Fermer"
                        onClick={(e) => {
                            e.stopPropagation();
                            onClose();
                        }}
                    >
                        <X className="h-6 w-6" />
                    </Button>
                )}
            </div>
        </div>
    );
};

export default DiscoveryVideoTransition;
