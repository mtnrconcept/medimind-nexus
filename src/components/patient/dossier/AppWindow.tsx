import React, { useState, useRef, useEffect } from 'react';
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
    defaultSize = { width: 450, height: 600 },
    zIndex = 50,
    onFocus
}) => {
    const [isMaximized, setIsMaximized] = useState(false);
    const [size, setSize] = useState(defaultSize);
    const nodeRef = useRef(null);

    const toggleMaximize = () => {
        setIsMaximized(!isMaximized);
    };

    return (
        <Draggable
            nodeRef={nodeRef}
            handle=".window-handle"
            defaultPosition={defaultPosition}
            disabled={isMaximized}
            onStart={onFocus}
        >
            <div
                ref={nodeRef}
                style={{ zIndex }}
                className={cn(
                    "absolute shadow-2xl rounded-xl border border-border/50 bg-background/95 backdrop-blur-md overflow-hidden flex flex-col transition-all duration-200",
                    isMaximized ? "inset-0 !transform-none !w-full !h-full rounded-none" : ""
                )}
            >
                {/* Window Handle / Header */}
                <div
                    className="window-handle shrink-0 h-10 bg-muted/30 border-b border-border/10 flex items-center justify-between px-3 cursor-move hover:bg-muted/50 transition-colors"
                    onDoubleClick={toggleMaximize}
                >
                    <div className="flex items-center gap-2">
                        <Move className="h-3 w-3 text-muted-foreground" />
                        <span className="text-xs font-bold uppercase tracking-widest opacity-80">{title}</span>
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
                            maxConstraints={[1200, 1000]}
                            resizeHandles={['se']}
                            className="flex flex-col h-full"
                        >
                            <div className="w-full h-full overflow-y-auto custom-scrollbar bg-card/20 p-4">
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
        </Draggable>
    );
};

export default AppWindow;
