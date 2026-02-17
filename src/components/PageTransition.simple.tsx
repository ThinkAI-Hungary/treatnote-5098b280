import { ReactNode, useRef, useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';

interface PageTransitionProps {
    children: ReactNode;
}

/**
 * Simple class-based fade-in transition (backup).
 * To revert to this, rename this file to PageTransition.tsx.
 */
export function PageTransition({ children }: PageTransitionProps) {
    const location = useLocation();
    const containerRef = useRef<HTMLDivElement>(null);
    const prevPathRef = useRef(location.pathname);
    const [visible, setVisible] = useState(true);

    useEffect(() => {
        if (prevPathRef.current !== location.pathname) {
            prevPathRef.current = location.pathname;
            setVisible(false);
            requestAnimationFrame(() => {
                requestAnimationFrame(() => {
                    setVisible(true);
                });
            });
        }
    }, [location.pathname]);

    return (
        <div
            ref={containerRef}
            className={`page-transition-container ${visible ? 'page-enter' : 'page-before-enter'}`}
        >
            {children}
        </div>
    );
}
