import { ReactNode, useRef, useLayoutEffect, useState, useEffect, useCallback } from 'react';
import { useLocation } from 'react-router-dom';

interface PageTransitionProps {
    children: ReactNode;
}

// Delay before content starts fading in (lets shockwave establish first)
const CONTENT_DELAY_MS = 500;
// How long before a shockwave element is removed from DOM (matches CSS)
const SHOCKWAVE_LIFETIME_MS = 3800;

/**
 * Page transition with frosted-glass shockwave.
 *
 * Sequence on page change:
 *   1. Content hides instantly via CSS class with !important (bulletproof)
 *   2. Shockwave starts expanding over the bare background
 *   3. After delay, content animates in via Web Animations API
 *
 * Multiple shockwaves can coexist simultaneously.
 *
 * To revert: copy PageTransition.simple.tsx → PageTransition.tsx
 */
export function PageTransition({ children }: PageTransitionProps) {
    const location = useLocation();
    const containerRef = useRef<HTMLDivElement>(null);
    const prevPathRef = useRef(location.pathname);
    const [shockwaves, setShockwaves] = useState<number[]>([]);
    const nextId = useRef(0);
    const contentTimer = useRef<number>(0);
    const activeAnimation = useRef<Animation | null>(null);

    const clearContentTimer = useCallback(() => {
        if (contentTimer.current) {
            clearTimeout(contentTimer.current);
            contentTimer.current = 0;
        }
    }, []);

    // useLayoutEffect: fires AFTER DOM mutation but BEFORE browser paint.
    useLayoutEffect(() => {
        if (prevPathRef.current === location.pathname) return;
        prevPathRef.current = location.pathname;

        const container = containerRef.current;
        if (!container) return;

        clearContentTimer();

        // ── BULLETPROOF HIDE ──
        // 1. Cancel ALL animations on this element (including fill:forwards ones
        //    that override inline styles)
        container.getAnimations().forEach(a => a.cancel());
        if (activeAnimation.current) {
            activeAnimation.current.cancel();
            activeAnimation.current = null;
        }

        // 2. Add CSS class with !important — nothing can override this
        container.classList.add('page-content-hidden');

        // 3. Clear any leftover inline styles from previous animations
        container.style.opacity = '';
        container.style.transform = '';
        container.style.filter = '';

        // ── SHOCKWAVE ──
        // Spawn a new one (doesn't remove previous — multiple can coexist)
        const id = nextId.current++;
        setShockwaves(prev => [...prev, id]);

        // Auto-remove this shockwave after its CSS animation finishes
        setTimeout(() => {
            setShockwaves(prev => prev.filter(s => s !== id));
        }, SHOCKWAVE_LIFETIME_MS);

        // ── CONTENT ENTRANCE ──
        // After shockwave has been going, remove hiding class and animate in
        contentTimer.current = window.setTimeout(() => {
            if (!container) return;

            // Remove the hiding class
            container.classList.remove('page-content-hidden');

            // Animate in via Web Animations API (always re-triggers reliably)
            const anim = container.animate(
                [
                    {
                        opacity: 0,
                        transform: 'scale(0.98) translateY(8px)',
                        filter: 'blur(2px)',
                    },
                    {
                        opacity: 1,
                        transform: 'scale(1) translateY(0)',
                        filter: 'blur(0px)',
                    },
                ],
                {
                    duration: 400,
                    easing: 'cubic-bezier(0.25, 0.46, 0.45, 0.94)',
                    fill: 'forwards',
                }
            );

            activeAnimation.current = anim;

            anim.onfinish = () => {
                // Clear fill:forwards state so it won't interfere next time
                container.style.opacity = '1';
                container.style.transform = '';
                container.style.filter = '';
                anim.cancel(); // Remove the animation entirely
                if (activeAnimation.current === anim) {
                    activeAnimation.current = null;
                }
            };
        }, CONTENT_DELAY_MS);
    }, [location.pathname, clearContentTimer]);

    // Cleanup on unmount
    useEffect(() => {
        return () => {
            clearContentTimer();
            if (activeAnimation.current) {
                activeAnimation.current.cancel();
            }
        };
    }, [clearContentTimer]);

    return (
        <div className="page-transition-wrapper">
            {/* Shockwave rings — multiple can coexist */}
            {shockwaves.map(id => (
                <div key={id} className="shockwave-ring" />
            ))}

            {/* Page content */}
            <div ref={containerRef} className="page-content-layer">
                {children}
            </div>
        </div>
    );
}
