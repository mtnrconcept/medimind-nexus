import React, { createContext, useContext, useRef, useCallback } from 'react';

interface PanelRect {
    id: string;
    left: number;
    top: number;
    width: number;
    height: number;
}

interface PanelRegistryContextType {
    registerPanel: (id: string, ref: React.RefObject<HTMLDivElement>) => void;
    unregisterPanel: (id: string) => void;
    getOtherPanelRects: (excludeId: string) => PanelRect[];
    checkCollision: (
        excludeId: string,
        newRect: { left: number; top: number; width: number; height: number }
    ) => { left: number; top: number; width: number; height: number } | null;
}

const PanelRegistryContext = createContext<PanelRegistryContextType | null>(null);

export const usePanelRegistry = () => {
    const context = useContext(PanelRegistryContext);
    return context;
};

export const PanelRegistryProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const panelsRef = useRef<Map<string, React.RefObject<HTMLDivElement>>>(new Map());

    const registerPanel = useCallback((id: string, ref: React.RefObject<HTMLDivElement>) => {
        panelsRef.current.set(id, ref);
    }, []);

    const unregisterPanel = useCallback((id: string) => {
        panelsRef.current.delete(id);
    }, []);

    const getOtherPanelRects = useCallback((excludeId: string): PanelRect[] => {
        const rects: PanelRect[] = [];
        panelsRef.current.forEach((ref, id) => {
            if (id !== excludeId && ref.current) {
                const rect = ref.current.getBoundingClientRect();
                rects.push({
                    id,
                    left: rect.left,
                    top: rect.top,
                    width: rect.width,
                    height: rect.height
                });
            }
        });
        return rects;
    }, []);

    // Check if newRect collides with any other panel and return adjusted rect if needed
    const checkCollision = useCallback((
        excludeId: string,
        newRect: { left: number; top: number; width: number; height: number }
    ): { left: number; top: number; width: number; height: number } | null => {
        const otherRects = getOtherPanelRects(excludeId);
        let adjusted = { ...newRect };
        let hasCollision = false;

        for (const other of otherRects) {
            // Check for overlap
            const overlapsX = adjusted.left < other.left + other.width &&
                adjusted.left + adjusted.width > other.left;
            const overlapsY = adjusted.top < other.top + other.height &&
                adjusted.top + adjusted.height > other.top;

            if (overlapsX && overlapsY) {
                hasCollision = true;

                // Calculate overlap amounts from each direction
                const overlapFromLeft = (other.left + other.width) - adjusted.left;
                const overlapFromRight = (adjusted.left + adjusted.width) - other.left;
                const overlapFromTop = (other.top + other.height) - adjusted.top;
                const overlapFromBottom = (adjusted.top + adjusted.height) - other.top;

                // Find minimum overlap direction and push out
                const minOverlap = Math.min(overlapFromLeft, overlapFromRight, overlapFromTop, overlapFromBottom);

                if (minOverlap === overlapFromLeft) {
                    adjusted.left = other.left + other.width;
                } else if (minOverlap === overlapFromRight) {
                    adjusted.left = other.left - adjusted.width;
                } else if (minOverlap === overlapFromTop) {
                    adjusted.top = other.top + other.height;
                } else {
                    adjusted.top = other.top - adjusted.height;
                }
            }
        }

        return hasCollision ? adjusted : null;
    }, [getOtherPanelRects]);

    return (
        <PanelRegistryContext.Provider value={{ registerPanel, unregisterPanel, getOtherPanelRects, checkCollision }}>
            {children}
        </PanelRegistryContext.Provider>
    );
};
