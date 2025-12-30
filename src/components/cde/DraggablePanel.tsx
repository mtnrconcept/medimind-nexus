import React, { useState, useEffect, useRef, useCallback } from 'react';
import { GripHorizontal, Minus, Maximize2 } from 'lucide-react';
import { usePanelRegistry } from './PanelRegistry';

interface DraggablePanelProps {
    children: React.ReactNode;
    initialPosition?: { x: number; y: number };
    className?: string;
    id?: string;
    onPositionChange?: (pos: { x: number; y: number }) => void;
    handleClass?: string;
    resizable?: boolean;
    minimizable?: boolean;
    title?: string;
    initialMinimized?: boolean;
    minWidth?: number;
    minHeight?: number;
}

// Generate unique ID if not provided
let panelIdCounter = 0;
const generatePanelId = () => `panel-${++panelIdCounter}`;

const DraggablePanel: React.FC<DraggablePanelProps> = ({
    children,
    initialPosition = { x: 0, y: 0 },
    className = "",
    id: externalId,
    onPositionChange,
    handleClass = "drag-handle",
    resizable = false,
    minimizable = false,
    title,
    initialMinimized = false,
    minWidth = 150,
    minHeight = 100
}) => {
    const [position, setPosition] = useState(initialPosition);
    const [isDragging, setIsDragging] = useState(false);
    const [isMinimized, setIsMinimized] = useState(initialMinimized);
    const [size, setSize] = useState({ width: 0, height: 0 });
    const [isResizing, setIsResizing] = useState(false);
    const dragStartOffset = useRef({ x: 0, y: 0 });
    const resizeStartSize = useRef({ width: 0, height: 0 });
    const resizeStartPos = useRef({ x: 0, y: 0 });
    const panelRef = useRef<HTMLDivElement>(null);
    const panelIdRef = useRef(externalId || generatePanelId());

    const panelRegistry = usePanelRegistry();

    // Register panel with registry on mount
    useEffect(() => {
        if (panelRegistry) {
            panelRegistry.registerPanel(panelIdRef.current, panelRef);
            return () => panelRegistry.unregisterPanel(panelIdRef.current);
        }
    }, [panelRegistry]);

    const handleMouseDown = useCallback((e: React.MouseEvent) => {
        const target = e.target as HTMLElement;

        // Check if we clicked a handle
        const isHandle = handleClass && target.closest(`.${handleClass}`);

        // If handleClass is specified but we didn't click it, only allow dragging if we are NOT using a handle system
        if (handleClass && !isHandle) return;

        // Prevent dragging if clicking on interactive elements
        if (target.tagName === 'BUTTON' ||
            target.tagName === 'INPUT' ||
            target.tagName === 'A' ||
            target.tagName === 'SELECT' ||
            target.tagName === 'TEXTAREA' ||
            target.closest('button') ||
            target.closest('input') ||
            target.closest('a')
        ) return;

        e.preventDefault();
        e.stopPropagation();
        setIsDragging(true);

        const rect = panelRef.current?.getBoundingClientRect();
        if (rect) {
            dragStartOffset.current = {
                x: e.clientX - rect.left,
                y: e.clientY - rect.top
            };
        }
    }, [handleClass]);

    // Resize handler
    const handleResizeStart = useCallback((e: React.MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();
        setIsResizing(true);
        resizeStartPos.current = { x: e.clientX, y: e.clientY };
        const rect = panelRef.current?.getBoundingClientRect();
        if (rect) {
            resizeStartSize.current = { width: rect.width, height: rect.height };
        }
    }, []);

    useEffect(() => {
        const FOOTER_HEIGHT = 40; // Height of the footer bar

        const handleMouseMove = (e: MouseEvent) => {
            if (isDragging) {
                let newX = e.clientX - dragStartOffset.current.x;
                let newY = e.clientY - dragStartOffset.current.y;

                // Get panel dimensions for proper constraint
                const panelWidth = panelRef.current?.offsetWidth || 100;
                const panelHeight = panelRef.current?.offsetHeight || 100;

                // Clamp to viewport - keep panel fully within screen
                newX = Math.max(0, Math.min(newX, window.innerWidth - panelWidth));
                newY = Math.max(0, Math.min(newY, window.innerHeight - FOOTER_HEIGHT - panelHeight));

                // Check for collision with other panels
                if (panelRegistry) {
                    const collision = panelRegistry.checkCollision(panelIdRef.current, {
                        left: newX,
                        top: newY,
                        width: panelWidth,
                        height: panelHeight
                    });
                    if (collision) {
                        // Use adjusted position, but re-clamp to viewport
                        newX = Math.max(0, Math.min(collision.left, window.innerWidth - panelWidth));
                        newY = Math.max(0, Math.min(collision.top, window.innerHeight - FOOTER_HEIGHT - panelHeight));
                    }
                }

                const newPos = { x: newX, y: newY };
                setPosition(newPos);
                onPositionChange?.(newPos);
            }

            if (isResizing) {
                const deltaX = e.clientX - resizeStartPos.current.x;
                const deltaY = e.clientY - resizeStartPos.current.y;

                // Calculate max dimensions based on panel position and viewport
                const panelRect = panelRef.current?.getBoundingClientRect();
                const panelLeft = panelRect?.left || 0;
                const panelTop = panelRect?.top || 0;
                let maxWidth = window.innerWidth - panelLeft;
                let maxHeight = window.innerHeight - panelTop - FOOTER_HEIGHT;

                // Check for collision during resize
                if (panelRegistry) {
                    const otherPanels = panelRegistry.getOtherPanelRects(panelIdRef.current);
                    for (const other of otherPanels) {
                        // Check if this panel is to the right
                        if (other.left > panelLeft && other.top < panelTop + (panelRect?.height || 0) && other.top + other.height > panelTop) {
                            maxWidth = Math.min(maxWidth, other.left - panelLeft);
                        }
                        // Check if this panel is below
                        if (other.top > panelTop && other.left < panelLeft + (panelRect?.width || 0) && other.left + other.width > panelLeft) {
                            maxHeight = Math.min(maxHeight, other.top - panelTop);
                        }
                    }
                }

                setSize({
                    width: Math.max(minWidth, Math.min(maxWidth, resizeStartSize.current.width + deltaX)),
                    height: Math.max(minHeight, Math.min(maxHeight, resizeStartSize.current.height + deltaY))
                });
            }
        };

        const handleMouseUp = () => {
            setIsDragging(false);
            setIsResizing(false);
        };

        if (isDragging || isResizing) {
            window.addEventListener('mousemove', handleMouseMove);
            window.addEventListener('mouseup', handleMouseUp);
        }

        return () => {
            window.removeEventListener('mousemove', handleMouseMove);
            window.removeEventListener('mouseup', handleMouseUp);
        };
    }, [isDragging, isResizing, onPositionChange, minWidth, minHeight, panelRegistry]);

    return (
        <div
            ref={panelRef}
            id={panelIdRef.current}
            className={`${className} transition-none flex flex-col`}
            style={{
                position: 'fixed',
                left: position.x,
                top: position.y,
                zIndex: isDragging || isResizing ? 60 : 50,
                cursor: isDragging ? 'grabbing' : 'auto',
                ...(size.width > 0 && !isMinimized ? {
                    width: size.width,
                    height: size.height,
                    maxHeight: size.height
                } : {}),
                overflow: 'hidden'
            }}
            onMouseDown={handleMouseDown}
        >
            {/* Minimizable header with title */}
            {minimizable && title && (
                <div className={`${handleClass} flex-shrink-0 flex items-center justify-between px-3 py-2 bg-gray-800/80 border-b border-gray-700/50 cursor-grab active:cursor-grabbing`}>
                    <div className="flex items-center gap-2 text-gray-300 text-sm font-medium">
                        <GripHorizontal className="w-4 h-4 text-gray-500" />
                        {title}
                    </div>
                    <button
                        onClick={(e) => { e.stopPropagation(); setIsMinimized(!isMinimized); }}
                        className="text-gray-500 hover:text-white transition-colors p-1"
                        title={isMinimized ? "Agrandir" : "Réduire"}
                    >
                        {isMinimized ? <Maximize2 className="w-3 h-3" /> : <Minus className="w-3 h-3" />}
                    </button>
                </div>
            )}

            {/* Content - hidden when minimized, uses flex-1 to fill available space */}
            {!isMinimized && (
                <div className="flex-1 overflow-hidden flex flex-col min-h-0">
                    {children}
                </div>
            )}

            {/* Resize handle */}
            {resizable && !isMinimized && (
                <div
                    className="absolute bottom-0 right-0 w-4 h-4 cursor-se-resize opacity-50 hover:opacity-100 transition-opacity flex-shrink-0"
                    onMouseDown={handleResizeStart}
                    style={{
                        background: 'linear-gradient(135deg, transparent 50%, rgb(100,100,100) 50%)'
                    }}
                />
            )}
        </div>
    );
};

export default DraggablePanel;
