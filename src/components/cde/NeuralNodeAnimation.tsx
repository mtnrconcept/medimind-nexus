import { useEffect, useRef } from 'react';

interface Node {
    x: number;
    y: number;
    z: number;
    vx: number;
    vy: number;
    vz: number;
}

export function NeuralNodeAnimation() {
    const canvasRef = useRef<HTMLCanvasElement>(null);

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;

        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        let animationFrameId: number;
        let width = 0;
        let height = 0;

        const nodes: Node[] = [];
        const numNodes = 60;
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
                    vx: (Math.random() - 0.5) * 1.5,
                    vy: (Math.random() - 0.5) * 1.5,
                    vz: (Math.random() - 0.5) * 1.5,
                });
            }
        };

        window.addEventListener('resize', resize);
        resize();
        initNodes();

        const draw = () => {
            ctx.clearRect(0, 0, width, height);

            // Update and draw nodes
            nodes.forEach(node => {
                node.x += node.vx;
                node.y += node.vy;
                node.z += node.vz;

                // Bounce off walls
                if (node.x < 0 || node.x > width) node.vx *= -1;
                if (node.y < 0 || node.y > height) node.vy *= -1;
                if (node.z < -200 || node.z > 200) node.vz *= -1;

                // 3D Projection
                const scale = 500 / (500 + node.z);
                const px = (node.x - width / 2) * scale + width / 2;
                const py = (node.y - height / 2) * scale + height / 2;

                // Draw point
                ctx.beginPath();
                ctx.arc(px, py, 2 * scale, 0, Math.PI * 2);
                ctx.fillStyle = `rgba(34, 211, 238, ${0.3 + 0.7 * scale})`; // cyan-400
                ctx.fill();

                // Add glow to points
                if (scale > 1) {
                    ctx.shadowBlur = 10 * scale;
                    ctx.shadowColor = '#22d3ee';
                } else {
                    ctx.shadowBlur = 0;
                }
            });

            // Draw connections
            ctx.shadowBlur = 0; // Disable glow for lines for performance
            for (let i = 0; i < nodes.length; i++) {
                for (let j = i + 1; j < nodes.length; j++) {
                    const n1 = nodes[i];
                    const n2 = nodes[j];

                    const dx = n1.x - n2.x;
                    const dy = n1.y - n2.y;
                    const dz = n1.z - n2.z;
                    const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);

                    if (dist < maxDistance) {
                        const opacity = 1 - dist / maxDistance;
                        const scale1 = 500 / (500 + n1.z);
                        const scale2 = 500 / (500 + n2.z);

                        const px1 = (n1.x - width / 2) * scale1 + width / 2;
                        const py1 = (n1.y - height / 2) * scale1 + height / 2;
                        const px2 = (n2.x - width / 2) * scale2 + width / 2;
                        const py2 = (n2.y - height / 2) * scale2 + height / 2;

                        ctx.beginPath();
                        ctx.moveTo(px1, py1);
                        ctx.lineTo(px2, py2);
                        ctx.strokeStyle = `rgba(34, 211, 238, ${opacity * 0.4})`;
                        ctx.lineWidth = 0.5 * ((scale1 + scale2) / 2);
                        ctx.stroke();
                    }
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
            style={{ filter: 'drop-shadow(0 0 10px rgba(34, 211, 238, 0.3))' }}
        />
    );
}
