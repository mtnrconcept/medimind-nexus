import React, { useEffect, useRef, useState } from 'react';
import { useTheme } from 'next-themes';

interface Particle {
    x: number;
    y: number;
    vx: number;
    vy: number;
    life: number;
    size: number;
}

const CursorCSS: React.FC = () => {
    const { theme } = useTheme();
    const cursorRef = useRef<HTMLDivElement>(null);
    const ringRef = useRef<HTMLDivElement>(null);
    const trailRef = useRef<HTMLDivElement>(null);
    const particlesRef = useRef<Particle[]>([]);
    const mousePos = useRef({ x: 0, y: 0 });
    const cursorPos = useRef({ x: 0, y: 0 });
    const rafRef = useRef<number>();
    const [isVisible, setIsVisible] = useState(false);

    useEffect(() => {
        // Initialize particles
        particlesRef.current = Array.from({ length: 12 }, () => ({
            x: 0,
            y: 0,
            vx: (Math.random() - 0.5) * 2,
            vy: (Math.random() - 0.5) * 2,
            life: Math.random(),
            size: Math.random() * 3 + 2
        }));

        const handleMouseMove = (e: MouseEvent) => {
            mousePos.current = { x: e.clientX, y: e.clientY };
            if (!isVisible) setIsVisible(true);
        };

        const handleMouseLeave = () => {
            setIsVisible(false);
        };

        const handleMouseEnter = () => {
            setIsVisible(true);
        };

        const animate = () => {
            // Smooth cursor following
            const ease = 0.15;
            cursorPos.current.x += (mousePos.current.x - cursorPos.current.x) * ease;
            cursorPos.current.y += (mousePos.current.y - cursorPos.current.y) * ease;

            // Update main cursor
            if (cursorRef.current) {
                cursorRef.current.style.transform = `translate(${cursorPos.current.x}px, ${cursorPos.current.y}px)`;
            }

            // Update ring with slower following
            if (ringRef.current) {
                const ringEase = 0.08;
                const ringX = cursorPos.current.x + (mousePos.current.x - cursorPos.current.x) * ringEase;
                const ringY = cursorPos.current.y + (mousePos.current.y - cursorPos.current.y) * ringEase;
                ringRef.current.style.transform = `translate(${ringX}px, ${ringY}px) rotate(${Date.now() * 0.02}deg)`;
            }

            // Update particles
            if (trailRef.current) {
                particlesRef.current.forEach((p, i) => {
                    p.life -= 0.02;
                    if (p.life <= 0) {
                        // Reset particle
                        p.x = cursorPos.current.x;
                        p.y = cursorPos.current.y;
                        p.vx = (Math.random() - 0.5) * 1.5;
                        p.vy = (Math.random() - 0.5) * 1.5;
                        p.life = 1;
                        p.size = Math.random() * 3 + 2;
                    }
                    p.x += p.vx;
                    p.y += p.vy;

                    const particle = trailRef.current?.children[i] as HTMLDivElement;
                    if (particle) {
                        particle.style.transform = `translate(${p.x}px, ${p.y}px)`;
                        particle.style.opacity = `${p.life * 0.6}`;
                        particle.style.width = `${p.size * p.life}px`;
                        particle.style.height = `${p.size * p.life}px`;
                    }
                });
            }

            rafRef.current = requestAnimationFrame(animate);
        };

        window.addEventListener('mousemove', handleMouseMove, { passive: true });
        document.addEventListener('mouseleave', handleMouseLeave);
        document.addEventListener('mouseenter', handleMouseEnter);
        rafRef.current = requestAnimationFrame(animate);

        return () => {
            window.removeEventListener('mousemove', handleMouseMove);
            document.removeEventListener('mouseleave', handleMouseLeave);
            document.removeEventListener('mouseenter', handleMouseEnter);
            if (rafRef.current) cancelAnimationFrame(rafRef.current);
        };
    }, [isVisible]);

    const isDark = theme === 'dark';
    const primaryColor = isDark ? '#22d3ee' : '#0891b2';
    const secondaryColor = isDark ? '#818cf8' : '#6366f1';

    return (
        <div
            className="fixed inset-0 pointer-events-none z-[9999]"
            style={{
                opacity: isVisible ? 1 : 0,
                transition: 'opacity 0.3s ease'
            }}
        >
            {/* Trail particles */}
            <div ref={trailRef}>
                {particlesRef.current.map((_, i) => (
                    <div
                        key={i}
                        className="absolute rounded-full"
                        style={{
                            width: 4,
                            height: 4,
                            backgroundColor: i % 2 === 0 ? primaryColor : secondaryColor,
                            boxShadow: `0 0 6px ${i % 2 === 0 ? primaryColor : secondaryColor}`,
                            marginLeft: -2,
                            marginTop: -2,
                        }}
                    />
                ))}
            </div>

            {/* Outer rotating ring */}
            <div
                ref={ringRef}
                className="absolute"
                style={{
                    width: 28,
                    height: 28,
                    marginLeft: -14,
                    marginTop: -14,
                    border: `1.5px solid ${primaryColor}40`,
                    borderRadius: '50%',
                    boxShadow: `0 0 10px ${primaryColor}20`,
                }}
            >
                {/* Orbital dots */}
                <div
                    className="absolute"
                    style={{
                        width: 4,
                        height: 4,
                        backgroundColor: secondaryColor,
                        borderRadius: '50%',
                        top: -2,
                        left: '50%',
                        marginLeft: -2,
                        boxShadow: `0 0 4px ${secondaryColor}`,
                    }}
                />
                <div
                    className="absolute"
                    style={{
                        width: 3,
                        height: 3,
                        backgroundColor: primaryColor,
                        borderRadius: '50%',
                        bottom: -1.5,
                        right: 2,
                        boxShadow: `0 0 4px ${primaryColor}`,
                    }}
                />
            </div>

            {/* Core cursor */}
            <div
                ref={cursorRef}
                className="absolute"
                style={{
                    width: 8,
                    height: 8,
                    marginLeft: -4,
                    marginTop: -4,
                    backgroundColor: primaryColor,
                    borderRadius: '50%',
                    boxShadow: `0 0 12px ${primaryColor}, 0 0 24px ${primaryColor}60`,
                }}
            >
                {/* Inner glow */}
                <div
                    className="absolute inset-0 rounded-full animate-pulse"
                    style={{
                        backgroundColor: 'white',
                        opacity: 0.6,
                        transform: 'scale(0.5)',
                    }}
                />
            </div>

            {/* CSS for pulse animation */}
            <style>{`
                @keyframes cursor-pulse {
                    0%, 100% { transform: scale(1); opacity: 1; }
                    50% { transform: scale(1.2); opacity: 0.8; }
                }
            `}</style>
        </div>
    );
};

export default CursorCSS;
