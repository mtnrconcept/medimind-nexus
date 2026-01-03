import React, { useState, useRef } from 'react';
import { createPortal } from 'react-dom';
import Draggable from 'react-draggable';
import { ResizableBox } from 'react-resizable';
import { X, Maximize2, Minimize2, Move } from 'lucide-react';
import { cn } from '@/lib/utils';
import 'react-resizable/css/styles.css';

interface AppWindowProps {
    id: string;
    title: string;
    children: React.ReactNode;
    onClose: () => void;
    defaultPosition?: { x: number; y: number };
    defaultSize?: { width: number; height: number };
    zIndex?: number;
    onFocus?: () => void;
}

const AppWindow: React.FC<AppWindowProps> = ({
    id,
    title,
    children,
    onClose,
    defaultPosition = { x: 100, y: 100 },
    defaultSize = { width: 480, height: 800 },
    zIndex = 50,
    onFocus
}) => {
    const [isMaximized, setIsMaximized] = useState(false);
    const [isDragging, setIsDragging] = useState(false);
    const [size, setSize] = useState(defaultSize);
    const nodeRef = useRef(null);

    const toggleMaximize = () => {
        setIsMaximized(!isMaximized);
    };

    const windowContent = (
        <Draggable
            nodeRef={nodeRef}
            handle=".window-handle"
            defaultPosition={defaultPosition}
            disabled={isMaximized}
            onStart={() => {
                onFocus?.();
                setIsDragging(true);
            }}
            onStop={() => setIsDragging(false)}
        >
            <div
                ref={nodeRef}
                style={{ zIndex }}
                className={cn(
                    "fixed top-0 left-0 rounded-xl border border-white/20 bg-background/90 overflow-hidden flex flex-col",
                    isDragging ? "shadow-none backdrop-blur-none cursor-grabbing" : "shadow-[0_20px_50px_rgba(0,0,0,0.3)] backdrop-blur-xl transition-[width,height,opacity] duration-200",
                    "max-h-[calc(100vh-40px)]",
                    isMaximized ? "inset-0 !transform-none !w-full !h-full rounded-none" : ""
                )}
            >
                {/* Window Handle / Header */}
                <div
                    className="window-handle shrink-0 h-10 bg-muted/40 border-b border-border/10 flex items-center justify-between px-3 cursor-move hover:bg-muted/60"
                    onDoubleClick={toggleMaximize}
                >
                    <div className="flex items-center gap-2">
                        <Move className="h-3 w-3 text-primary/70" />
                        <span className="text-[10px] font-bold uppercase tracking-widest opacity-80">{title}</span>
                    </div>
                    <div className="flex items-center gap-1">
                        <button
                            onClick={toggleMaximize}
                            className="p-1.5 hover:bg-primary/10 rounded-lg text-muted-foreground hover:text-primary transition-colors"
                        >
                            {isMaximized ? <Minimize2 className="h-3 w-3" /> : <Maximize2 className="h-3 w-3" />}
                        </button>
                        <button
                            onClick={onClose}
                            className="p-1.5 hover:bg-destructive/10 rounded-lg text-muted-foreground hover:text-destructive transition-colors"
                        >
                            <X className="h-3.5 w-3.5" />
                        </button>
                    </div>
                </div>

                {/* Content */}
                <div className="flex-1 overflow-hidden relative">
                    {!isMaximized ? (
                        <ResizableBox
                            width={size.width}
                            height={size.height - 40}
                            onResize={(e, { size: newSize }) => setSize({ width: newSize.width, height: newSize.height + 40 })}
                            minConstraints={[300, 200]}
                            maxConstraints={[1200, typeof window !== 'undefined' ? window.innerHeight - 80 : 800]}
                            resizeHandles={['se']}
                            className="flex flex-col h-full"
                        >
                            <div className="w-full h-full overflow-y-auto custom-scrollbar bg-card/10 p-4">
                                {children}
                            </div>
                        </ResizableBox>
                    ) : (
                        <div className="w-full h-full overflow-y-auto custom-scrollbar p-6">
                            {children}
                        </div>
                    )}
                </div>
            </div>
        </Draggable >
    );

    return createPortal(windowContent, document.body);
};

export default AppWindow;
