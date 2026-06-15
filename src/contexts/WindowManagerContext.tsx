import React, { createContext, useContext, useState, useCallback } from 'react';

export type WindowCategory =
    | 'medical_history' | 'family_history' | 'allergies' | 'medications'
    | 'vaccinations' | 'lifestyle' | 'clinical_data' | 'lab_results'
    | 'imaging' | 'functional_exams' | 'prevention' | 'consultations'
    | 'mental_health' | 'reproductive' | 'social_factors' | 'dental'
    | 'communications' | 'monitoring' | 'age_specific' | 'side_effects'
    | 'documents' | 'summary' | 'add_entry' | 'edit_entry' | 'custom';

export interface WindowData {
    id: string;
    title: string;
    category: WindowCategory;
    content?: React.ReactNode;
    zIndex: number;
    x: number;
    y: number;
    width?: number;
    height?: number;
}

interface WindowManagerContextType {
    openWindows: WindowData[];
    openWindow: (win: Omit<WindowData, 'zIndex'>) => void;
    closeWindow: (id: string) => void;
    focusWindow: (id: string) => void;
    maxZIndex: number;
}

const WindowManagerContext = createContext<WindowManagerContextType | undefined>(undefined);

export const WindowManagerProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [openWindows, setOpenWindows] = useState<WindowData[]>([]);
    const [maxZIndex, setMaxZIndex] = useState(10000); // Start high to be over dashboard

    const openWindow = useCallback((win: Omit<WindowData, 'zIndex'>) => {
        setOpenWindows(prev => {
            const existing = prev.find(w => w.id === win.id || (win.category !== 'custom' && w.category === win.category));
            if (existing) {
                // Focus existing
                return prev.map(w => w.id === existing.id ? { ...w, zIndex: maxZIndex + 1 } : w);
            }
            // Add new
            const newWin = { ...win, zIndex: maxZIndex + 1 };
            return [...prev, newWin];
        });
        setMaxZIndex(prev => prev + 1);
    }, [maxZIndex]);

    const closeWindow = useCallback((id: string) => {
        setOpenWindows(prev => prev.filter(w => w.id !== id));
    }, []);

    const focusWindow = useCallback((id: string) => {
        setOpenWindows(prev => prev.map(w =>
            w.id === id ? { ...w, zIndex: maxZIndex + 1 } : w
        ));
        setMaxZIndex(prev => prev + 1);
    }, [maxZIndex]);

    return (
        <WindowManagerContext.Provider value={{ openWindows, openWindow, closeWindow, focusWindow, maxZIndex }}>
            {children}
        </WindowManagerContext.Provider>
    );
};

export const useWindowManager = () => {
    const context = useContext(WindowManagerContext);
    if (!context) {
        throw new Error('useWindowManager must be used within a WindowManagerProvider');
    }
    return context;
};
