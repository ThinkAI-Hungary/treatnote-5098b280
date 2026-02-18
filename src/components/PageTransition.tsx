import { ReactNode, useRef, useLayoutEffect, useState, useEffect, useCallback } from 'react';
import { useLocation } from 'react-router-dom';
import { usePageLoading } from '@/contexts/PageLoadingContext';

interface PageTransitionProps {
    children: ReactNode;
}

// Minimum delay so the shockwave has time to establish visually
const MIN_DELAY_MS = 300;
// Interval to fire additional shockwaves while still loading
const SHOCKWAVE_REPEAT_MS = 3000;
// How long before a shockwave element is removed from DOM (matches CSS)
const SHOCKWAVE_LIFETIME_MS = 3800;

/**
 * Page transition with frosted-glass shockwave — **loading-aware**.
 *
 * Sequence on page change:
 *   1. Content hides instantly via CSS class with !important (bulletproof)
 *   2. Shockwave starts expanding over the bare background
 *   3. Once MIN_DELAY has passed AND the page signals "not loading",
 *      content animates in immediately
 *   4. If the page is still loading after one shockwave cycle (~3s),
 *      additional shockwaves fire every SHOCKWAVE_REPEAT_MS as a
 *      visual "still loading" indicator
 *
 * Multiple shockwaves can coexist simultaneously.
 */
export function PageTransition({ children }: PageTransitionProps) {
    const location = useLocation();
    const { isPageLoading } = usePageLoading();
    const containerRef = useRef<HTMLDivElement>(null);
    const prevPathRef = useRef(location.pathname);
    const [shockwaves, setShockwaves] = useState<number[]>([]);
    const nextId = useRef(0);
    const activeAnimation = useRef<Animation | null>(null);

    // Track whether we are in the "waiting to reveal" state
    const contentRevealedRef = useRef(true); // true = visible (initial)
    const minDelayPassedRef = useRef(false);
    const repeatTimerRef = useRef<ReturnType<typeof setInterval>>();

    // A counter that increments to force re-render when minDelay passes
    const [, setTick] = useState(0);

    /** Spawn a shockwave and auto-remove it after its CSS animation ends */
    const spawnShockwave = useCallback(() => {
        const id = nextId.current++;
        setShockwaves(prev => [...prev, id]);
        setTimeout(() => {
            setShockwaves(prev => prev.filter(s => s !== id));
        }, SHOCKWAVE_LIFETIME_MS);
    }, []);

    const clearRepeatTimer = useCallback(() => {
        if (repeatTimerRef.current) {
            clearInterval(repeatTimerRef.current);
            repeatTimerRef.current = undefined;
        }
    }, []);

    /** Animate content in (reveal) */
    const revealContent = useCallback(() => {
        if (contentRevealedRef.current) return;
        const container = containerRef.current;
        if (!container) return;

        contentRevealedRef.current = true;
        clearRepeatTimer();

        // Remove the hiding class
        container.classList.remove('page-content-hidden');

        // Animate in via Web Animations API
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
            container.style.opacity = '1';
            container.style.transform = '';
            container.style.filter = '';
            anim.cancel();
            if (activeAnimation.current === anim) {
                activeAnimation.current = null;
            }
        };
    }, [clearRepeatTimer]);

    // ── ROUTE CHANGE ──
    useLayoutEffect(() => {
        if (prevPathRef.current === location.pathname) return;
        prevPathRef.current = location.pathname;

        const container = containerRef.current;
        if (!container) return;

        clearRepeatTimer();
        minDelayPassedRef.current = false;
        contentRevealedRef.current = false;

        // ── BULLETPROOF HIDE ──
        container.getAnimations().forEach(a => a.cancel());
        if (activeAnimation.current) {
            activeAnimation.current.cancel();
            activeAnimation.current = null;
        }
        container.classList.add('page-content-hidden');
        container.style.opacity = '';
        container.style.transform = '';
        container.style.filter = '';

        // ── FIRST SHOCKWAVE ──
        spawnShockwave();

        // ── MIN DELAY TIMER ──
        // After MIN_DELAY, mark the shockwave as established and trigger a
        // re-render so the loading-watcher effect can decide to reveal.
        const minTimer = window.setTimeout(() => {
            minDelayPassedRef.current = true;
            setTick(t => t + 1); // force re-render to trigger the watcher
        }, MIN_DELAY_MS);

        // ── REPEAT SHOCKWAVES ──
        repeatTimerRef.current = setInterval(() => {
            if (!contentRevealedRef.current) {
                spawnShockwave();
            } else {
                clearRepeatTimer();
            }
        }, SHOCKWAVE_REPEAT_MS);

        return () => {
            clearTimeout(minTimer);
        };
    }, [location.pathname, clearRepeatTimer, spawnShockwave]);

    // ── LOADING STATE WATCHER ──
    // Reveal content once BOTH: minDelay passed AND isPageLoading is false.
    useEffect(() => {
        if (contentRevealedRef.current) return;

        if (!isPageLoading && minDelayPassedRef.current) {
            revealContent();
        }
    }); // intentionally no deps — runs every render to catch ref changes

    // Cleanup on unmount
    useEffect(() => {
        return () => {
            clearRepeatTimer();
            if (activeAnimation.current) {
                activeAnimation.current.cancel();
            }
        };
    }, [clearRepeatTimer]);

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
