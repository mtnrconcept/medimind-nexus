import { useEffect, useRef } from 'react';

interface Node {
    x: number;
    y: number;
    z: number;
    vx: number;
    vy: number;
    vz: number;
    px: number;
    py: number;
    scale: number;
}

export function NeuralNodeAnimation() {
    const canvasRef = useRef<HTMLCanvasElement>(null);

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;

        const ctx = canvas.getContext('2d', { alpha: false });
        if (!ctx) return;

        let animationFrameId: number;
        let width = 0;
        let height = 0;

        const nodes: Node[] = [];
        const numNodes = 40; // Reduced from 60
        const maxDistance = 150;

        const resize = () => {
            const parent = canvas.parentElement;
            if (parent) {
                width = parent.clientWidth;
                height = parent.clientHeight;
                canvas.width = width;
                canvas.height = height;
            }
        };

        const initNodes = () => {
            nodes.length = 0;
            for (let i = 0; i < numNodes; i++) {
                nodes.push({
                    x: Math.random() * width,
                    y: Math.random() * height,
                    z: Math.random() * 400 - 200,
                    vx: (Math.random() - 0.5) * 1.2,
                    vy: (Math.random() - 0.5) * 1.2,
                    vz: (Math.random() - 0.5) * 1.2,
                    px: 0,
                    py: 0,
                    scale: 0,
                });
            }
        };

        window.addEventListener('resize', resize);
        resize();
        initNodes();

        const draw = () => {
            // Use a dark background instead of clearRect for performance + consistency
            ctx.fillStyle = '#111827'; // gray-900
            ctx.fillRect(0, 0, width, height);

            const halfWidth = width / 2;
            const halfHeight = height / 2;

            // Update and project nodes
            for (let i = 0; i < nodes.length; i++) {
                const node = nodes[i];
                node.x += node.vx;
                node.y += node.vy;
                node.z += node.vz;

                // Bounce off walls
                if (node.x < 0 || node.x > width) node.vx *= -1;
                if (node.y < 0 || node.y > height) node.vy *= -1;
                if (node.z < -200 || node.z > 200) node.vz *= -1;

                // 3D Projection
                node.scale = 500 / (500 + node.z);
                node.px = (node.x - halfWidth) * node.scale + halfWidth;
                node.py = (node.y - halfHeight) * node.scale + halfHeight;
            }

            // Draw connections - Grouped by opacity to reduce stroke calls
            ctx.lineWidth = 0.5;
            for (let i = 0; i < nodes.length; i++) {
                const n1 = nodes[i];
                for (let j = i + 1; j < nodes.length; j++) {
                    const n2 = nodes[j];

                    const dx = n1.x - n2.x;
                    const dy = n1.y - n2.y;
                    const dz = n1.z - n2.z;
                    const distSq = dx * dx + dy * dy + dz * dz;

                    if (distSq < maxDistance * maxDistance) {
                        const dist = Math.sqrt(distSq);
                        const opacity = (1 - dist / maxDistance) * 0.4;

                        ctx.beginPath();
                        ctx.moveTo(n1.px, n1.py);
                        ctx.lineTo(n2.px, n2.py);
                        ctx.strokeStyle = `rgba(34, 211, 238, ${opacity})`;
                        ctx.stroke();
                    }
                }
            }

            // Draw points on top
            for (let i = 0; i < nodes.length; i++) {
                const node = nodes[i];
                const r = 2 * node.scale;

                // Simple circle without shadowBlur (too slow)
                ctx.beginPath();
                ctx.arc(node.px, node.py, r, 0, Math.PI * 2);
                ctx.fillStyle = `rgba(34, 211, 238, ${0.4 + 0.6 * node.scale})`;
                ctx.fill();

                // Fake glow with a slightly larger, fainter circle if scale is high
                if (node.scale > 1.2) {
                    ctx.beginPath();
                    ctx.arc(node.px, node.py, r * 2, 0, Math.PI * 2);
                    ctx.fillStyle = `rgba(34, 211, 238, 0.1)`;
                    ctx.fill();
                }
            }

            animationFrameId = requestAnimationFrame(draw);
        };

        draw();

        return () => {
            window.removeEventListener('resize', resize);
            cancelAnimationFrame(animationFrameId);
        };
    }, []);

    return (
        <canvas
            ref={canvasRef}
            className="absolute inset-0 w-full h-full pointer-events-none"
        />
    );
}
