import React, { useEffect, useRef } from 'react';

const MEDICAL_TERMS = [
    "HYPERTENSION", "DIABETE", "ASTHME", "COVID-19", "GRIPPE",
    "IBUPROFENE", "PARACETAMOL", "AMOXICILLINE", "INSULINE", "METFORMINE",
    "CEPHALEE", "FIEVRE", "NAUSEE", "VERTIGE", "FATIGUE",
    "CANCER", "ARTHRITE", "DEPRESSION", "OSTEOPOROSE",
    "TACHYCARDIE", "BRADYCARIE", "ARRHYTHMIE", "INFARCTUS",
    "AVC", "AOMI", "BPCO", "EMPHYSEME", "BRONCHITE",
    "PNEUMONIE", "TUBERCULOSE", "HEPATITE", "CIRRHOSE",
    "GASTRITE", "ULCERE", "REFLUX", "COLITE",
    "CROHN", "ALLERGIE", "ECZEMA", "PSORIASIS",
    "ACNE", "GLAUCOME", "CATARACTE", "OTITE",
    "SINUSITE", "ANGINE", "RHUME", "GRIPPE",
    "VARICELLE", "ROUGEOLE", "OREILLONS", "RUBEOLE",
    "TETANOS", "POLIO", "DIPHTERIE", "COQUELUCHE",
    "MENINGITE", "SEPSIS", "CHOC", "COMA",
    "MIGRAINE", "EPILEPSIE", "ALZHEIMER", "PARKINSON",
    "SCLEROSE", "FIBROMYALGIE", "LUPUS", "GOUTTE",
    "VIH", "SIDA", "SYPHILIS", "HERPES",
    "CHLAMYDIA", "GONORRHEE", "HPV", "CANDIDOSE"
];

const KATAKANA = 'アァカサタナハマヤャラワガザダバパイィキシチニヒミリギジヂビピウゥクスツヌフムユュルグズブヅプエェケセテネヘメレゲゼデベペオォコソトノホモヨョロヲゴゾドボポヴッン';
const LATIN = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
const ALPHABET = MEDICAL_TERMS.join(" ") + KATAKANA + LATIN;

interface Drop {
    x: number;
    y: number;
    speed: number;
    depth: number; // 0.5 (far) to 1.5 (close)
    value: string;
    isTerm: boolean;
    term?: string;
    termIndex?: number;
    active: boolean; // Is the head bright?
}

interface Node {
    x: number;
    y: number;
    life: number;
    maxLife: number;
    term: string;
    depth: number;
}

export const MatrixLoader = ({ className, style }: { className?: string, style?: React.CSSProperties }) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        let animationFrameId: number;
        let drops: Drop[] = [];
        let nodes: Node[] = [];

        const initDrops = (width: number, height: number) => {
            drops = [];
            const columns = Math.floor(width / 14); // Bases on roughly 14px size
            // Create drops for 3 layers of depth
            for (let i = 0; i < columns; i++) {
                // More drops in background? No, simple column logic is harder with parallax.
                // Let's just spawn a bunch of "streams" at random X positions
                const streamCount = columns * 1.5;

                for (let j = 0; j < streamCount; j++) {
                    const depth = 0.5 + Math.random(); // 0.5 to 1.5
                    drops.push({
                        x: Math.random() * width,
                        y: Math.random() * -1000, // Start way above
                        speed: (2 + Math.random() * 3) * depth,
                        depth: depth,
                        value: '',
                        isTerm: false,
                        active: Math.random() > 0.5
                    });
                }
                return;
            }

            // Column based approach with parallax is tricky because columns overlap. 
            // Better approach: Independent drops scattered x-wise.
            const totalStreams = Math.floor(width / 10);
            for (let i = 0; i < totalStreams; i++) {
                const depth = 0.5 + Math.random();
                drops.push({
                    x: Math.random() * width,
                    y: Math.random() * height, // Start randomly on screen
                    speed: (1 + Math.random() * 2) * depth,
                    depth: depth,
                    value: ALPHABET[Math.floor(Math.random() * ALPHABET.length)],
                    isTerm: false,
                    active: true
                });
            }
        };

        const resizeCanvas = () => {
            if (containerRef.current && canvas) {
                canvas.width = containerRef.current.clientWidth;
                canvas.height = containerRef.current.clientHeight;
                initDrops(canvas.width, canvas.height);
            }
        };

        window.addEventListener('resize', resizeCanvas);
        resizeCanvas();

        const draw = () => {
            // Fade effect for trails
            ctx.fillStyle = 'rgba(0, 0, 0, 0.1)'; // Slightly more transparent for longer trails
            ctx.fillRect(0, 0, canvas.width, canvas.height);

            // Filter dead nodes
            nodes = nodes.filter(n => n.life < n.maxLife);

            // Sort drops by depth so close ones draw on top
            // (Sorting every frame might be expensive, but for <500 items it's fine)
            // Actually, let's just draw them. Depth separation by Z-index is better visually but sorting is correct.
            // Optimization: No sort, just draw. The alpha blend handles depth perception enough.

            drops.forEach(drop => {
                // Update character randomly
                if (Math.random() > 0.95) {
                    if (drop.isTerm && drop.term) {
                        // If it's a term, maybe don't change it, or reveal it letter by letter?
                        // Let's keep terms static once spawned until they fall off
                    } else {
                        drop.value = ALPHABET[Math.floor(Math.random() * ALPHABET.length)];
                    }
                }

                // Font settings based on depth
                const fontSize = Math.floor(12 * drop.depth);
                ctx.font = `${fontSize}px "Courier New", monospace`;

                // Color/Alpha based on depth
                const alpha = Math.min(1, drop.depth - 0.2);

                if (drop.active) {
                    ctx.fillStyle = `rgba(200, 255, 200, ${alpha})`; // Bright head

                    // Randomly spawn a term on the active head if it's in the foreground
                    if (!drop.isTerm && drop.depth > 1.2 && Math.random() > 0.995 && drop.y > 0 && drop.y < canvas.height - 100) {
                        drop.isTerm = true;
                        drop.term = MEDICAL_TERMS[Math.floor(Math.random() * MEDICAL_TERMS.length)];
                        drop.termIndex = 0;
                        // Also spawn a node here
                        nodes.push({
                            x: drop.x,
                            y: drop.y,
                            life: 0,
                            maxLife: 100,
                            term: drop.term,
                            depth: drop.depth
                        });
                    }
                } else {
                    ctx.fillStyle = `rgba(0, 255, 70, ${alpha * 0.6})`; // Dim tail
                }

                // Draw
                if (drop.isTerm && drop.term) {
                    // Draw full vertical term? Or horizontal? 
                    // Better: Horizontal floating text near the drop head
                    ctx.fillText(drop.value, drop.x, drop.y);
                } else {
                    ctx.fillText(drop.value, drop.x, drop.y);
                }

                // Move
                drop.y += drop.speed;

                // Reset
                if (drop.y > canvas.height) {
                    drop.y = -20;
                    drop.x = Math.random() * canvas.width;
                    drop.isTerm = false;
                }
            });

            // Draw Nodes and Connections (Foreground only effect usually)
            ctx.lineWidth = 1;

            for (let i = 0; i < nodes.length; i++) {
                const n = nodes[i];
                n.life++;

                const nodeAlpha = (1 - n.life / n.maxLife) * n.depth;

                ctx.fillStyle = `rgba(255, 255, 255, ${nodeAlpha})`;
                ctx.font = `bold ${12 * n.depth}px "Courier New"`;
                ctx.fillText(n.term, n.x + 10, n.y); // Draw term next to point

                // Connect to nearby nodes
                for (let j = i + 1; j < nodes.length; j++) {
                    const n2 = nodes[j];
                    const dx = n.x - n2.x;
                    const dy = n.y - n2.y;
                    const dist = Math.sqrt(dx * dx + dy * dy);

                    if (dist < 200 * n.depth) { // Connection range scales with depth
                        ctx.strokeStyle = `rgba(0, 255, 128, ${nodeAlpha * 0.5})`;
                        ctx.beginPath();
                        ctx.moveTo(n.x, n.y);
                        ctx.lineTo(n2.x, n2.y);
                        ctx.stroke();
                    }
                }
            }

            animationFrameId = requestAnimationFrame(draw);
        };

        draw();

        return () => {
            cancelAnimationFrame(animationFrameId);
            window.removeEventListener('resize', resizeCanvas);
        };
    }, []);

    return (
        <div ref={containerRef} className={`relative w-full h-[600px] bg-black overflow-hidden rounded-lg shadow-2xl border border-green-500/30 ${className}`} style={style}>
            <canvas ref={canvasRef} className="absolute top-0 left-0 w-full h-full block" />

            {/* Central Overlay for status */}
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-10">
                <div className="bg-black/60 backdrop-blur-md p-8 rounded-xl border border-green-500/50 shadow-[0_0_50px_rgba(0,255,0,0.2)] text-center transform transition-all duration-500">
                    <div className="text-4xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-green-300 via-green-500 to-emerald-400 mb-4 font-mono animate-pulse tracking-wider">
                        SYSTEME NEURAL
                    </div>
                    <div className="flex flex-col gap-2 items-center justify-center">
                        <div className="flex items-center gap-3 w-64">
                            <div className="text-green-400 font-mono text-xs">ANALYSE</div>
                            <div className="h-px bg-green-500/50 flex-1"></div>
                            <div className="text-green-400 font-mono text-xs">ACTIVE</div>
                        </div>

                        <div className="w-64 h-1.5 bg-green-950 rounded-full mt-2 overflow-hidden relative">
                            <div className="absolute inset-0 bg-green-500/20 animate-pulse"></div>
                            <div className="h-full bg-gradient-to-r from-green-500 to-emerald-300 w-1/2 animate-shimmer-slide rounded-full shadow-[0_0_10px_rgba(0,255,0,0.8)]"></div>
                        </div>

                        <div className="flex justify-between w-64 text-[10px] text-green-600 font-mono mt-1">
                            <span>LIAISONS: OPTIMAL</span>
                            <span className="animate-pulse">TRAITEMENT...</span>
                        </div>
                    </div>
                </div>
            </div>

            <style>{`
            @keyframes shimmer-slide {
                0% { transform: translateX(-150%); }
                100% { transform: translateX(250%); }
            }
            .animate-shimmer-slide {
                animation: shimmer-slide 1.5s infinite linear;
            }
        `}</style>
        </div>
    );
};
