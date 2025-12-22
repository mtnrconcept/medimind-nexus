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
    const videoRef = useRef<HTMLVideoElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (isOpen && fromRect) {
            // Initial state: positioned at button
            setIsAnimating(true);
            setIsExpanded(false);

            // Force reflow
            requestAnimationFrame(() => {
                // Trigger animation to expanded state
                setIsExpanded(true);

                // Play video
                if (videoRef.current) {
                    videoRef.current.currentTime = 0;
                    videoRef.current.play().catch(console.error);
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
            className={`fixed z-[100] transition-all duration-700 ease-[cubic-bezier(0.22,1,0.36,1)] ${isExpanded
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
                className={`relative overflow-hidden transition-all duration-700 ease-[cubic-bezier(0.22,1,0.36,1)] shadow-2xl ${isExpanded
                        ? 'w-full max-w-5xl aspect-video rounded-xl bg-black'
                        : 'w-full h-full rounded-md bg-transparent'
                    }`}
            >
                <video
                    ref={videoRef}
                    className="w-full h-full object-cover"
                    src="/video/discovery.mp4"
                    autoPlay
                    muted={false} // User interaction might be required for unmuted
                    playsInline
                    onEnded={onVideoEnd}
                />

                {isExpanded && (
                    <Button
                        size="icon"
                        variant="ghost"
                        className="absolute top-4 right-4 text-white hover:bg-white/20 rounded-full"
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
