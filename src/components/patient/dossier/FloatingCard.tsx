/**
 * FloatingCard - Draggable floating card with slide-in animation
 * 
 * Features:
 * - Slide-in animation from left
 * - Fully draggable (move anywhere)
 * - Inline editing with pencil button
 * - Close button with fade-out
 * - High z-index to appear above all content
 */

import { useState, useRef, useEffect, ReactNode } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { X, GripVertical, Minimize2, Maximize2 } from 'lucide-react';
import { cn } from '@/lib/utils';

interface FloatingCardProps {
    title: string;
    icon: ReactNode;
    isOpen: boolean;
    onClose: () => void;
    children: ReactNode;
    initialPosition?: { x: number; y: number };
    className?: string;
}

const FloatingCard = ({
    title,
    icon,
    isOpen,
    onClose,
    children,
    initialPosition = { x: 350, y: 100 },
    className
}: FloatingCardProps) => {
    const [position, setPosition] = useState(initialPosition);
    const [isDragging, setIsDragging] = useState(false);
    const [isMinimized, setIsMinimized] = useState(false);
    const [isVisible, setIsVisible] = useState(false);
    const [isClosing, setIsClosing] = useState(false);
    const dragRef = useRef<{ startX: number; startY: number; cardX: number; cardY: number } | null>(null);
    const cardRef = useRef<HTMLDivElement>(null);

    // Handle open/close animations
    useEffect(() => {
        if (isOpen) {
            setIsClosing(false);
            // Small delay for animation
            requestAnimationFrame(() => setIsVisible(true));
        } else if (isVisible) {
            setIsClosing(true);
            const timer = setTimeout(() => {
                setIsVisible(false);
                setIsClosing(false);
            }, 300);
            return () => clearTimeout(timer);
        }
    }, [isOpen]);

    // Reset position when reopening
    useEffect(() => {
        if (isOpen) {
            setPosition(initialPosition);
        }
    }, [isOpen, initialPosition]);

    const handleMouseDown = (e: React.MouseEvent) => {
        if ((e.target as HTMLElement).closest('.no-drag')) return;

        setIsDragging(true);
        dragRef.current = {
            startX: e.clientX,
            startY: e.clientY,
            cardX: position.x,
            cardY: position.y,
        };
    };

    useEffect(() => {
        const handleMouseMove = (e: MouseEvent) => {
            if (!isDragging || !dragRef.current) return;

            const deltaX = e.clientX - dragRef.current.startX;
            const deltaY = e.clientY - dragRef.current.startY;

            setPosition({
                x: dragRef.current.cardX + deltaX,
                y: dragRef.current.cardY + deltaY,
            });
        };

        const handleMouseUp = () => {
            setIsDragging(false);
            dragRef.current = null;
        };

        if (isDragging) {
            document.addEventListener('mousemove', handleMouseMove);
            document.addEventListener('mouseup', handleMouseUp);
        }

        return () => {
            document.removeEventListener('mousemove', handleMouseMove);
            document.removeEventListener('mouseup', handleMouseUp);
        };
    }, [isDragging]);

    if (!isVisible && !isOpen) return null;

    return (
        <div
            ref={cardRef}
            className={cn(
                "fixed z-50 transition-all duration-300 ease-out",
                isVisible && !isClosing ? "opacity-100 translate-x-0" : "opacity-0 -translate-x-8",
                isDragging && "cursor-grabbing select-none",
                className
            )}
            style={{
                left: position.x,
                top: position.y,
                width: isMinimized ? 'auto' : '400px',
            }}
        >
            <Card className="shadow-2xl border-2 border-primary/20 bg-background/95 backdrop-blur-sm">
                <CardHeader
                    className={cn(
                        "pb-2 cursor-grab active:cursor-grabbing flex flex-row items-center justify-between",
                        isDragging && "cursor-grabbing"
                    )}
                    onMouseDown={handleMouseDown}
                >
                    <div className="flex items-center gap-2">
                        <GripVertical className="h-4 w-4 text-muted-foreground" />
                        <div className="flex items-center gap-2 text-primary">
                            {icon}
                        </div>
                        <CardTitle className="text-base">{title}</CardTitle>
                    </div>
                    <div className="flex items-center gap-1 no-drag">
                        <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7"
                            onClick={() => setIsMinimized(!isMinimized)}
                        >
                            {isMinimized ? <Maximize2 className="h-4 w-4" /> : <Minimize2 className="h-4 w-4" />}
                        </Button>
                        <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-destructive hover:text-destructive"
                            onClick={onClose}
                        >
                            <X className="h-4 w-4" />
                        </Button>
                    </div>
                </CardHeader>

                {!isMinimized && (
                    <CardContent className="no-drag max-h-[60vh] overflow-y-auto">
                        {children}
                    </CardContent>
                )}
            </Card>
        </div>
    );
};

export default FloatingCard;
