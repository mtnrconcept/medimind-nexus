import { useState, useCallback, useRef, useEffect } from 'react';

export const useContainerWidth = () => {
    const [width, setWidth] = useState(0);
    const containerRef = useRef<HTMLDivElement>(null);

    const updateWidth = useCallback(() => {
        if (containerRef.current) {
            setWidth(containerRef.current.offsetWidth);
        }
    }, []);

    useEffect(() => {
        updateWidth();
        // Initial delay to ensure DOM is ready
        const timer = setTimeout(updateWidth, 100);

        window.addEventListener('resize', updateWidth);
        return () => {
            window.removeEventListener('resize', updateWidth);
            clearTimeout(timer);
        };
    }, [updateWidth]);

    return { containerRef, width };
};
