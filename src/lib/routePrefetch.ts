// Route prefetch map — maps sidebar paths to their lazy import functions.
// When a user hovers over a sidebar link, we call the import to preload
// the chunk so it's cached before they click.

const routeImportMap: Record<string, () => Promise<unknown>> = {
    '/dashboard': () => import('@/pages/Dashboard'),
    '/patients': () => import('@/pages/PatientManagement'),
    '/appointments': () => import('@/pages/Appointments'),
    '/examinations': () => import('@/pages/ExaminationsList'),
    '/dental-charting': () => import('@/pages/DentalCharting'),
    '/voice-recording': () => import('@/pages/VoiceRecording'),
    '/analytics': () => import('@/pages/Analytics'),
    '/downloads': () => import('@/pages/Downloads'),
    '/profile': () => import('@/pages/Profile'),
    '/settings': () => import('@/pages/Settings'),
    '/admin': () => import('@/pages/Admin'),
    '/klinika-admin': () => import('@/pages/KlinikaAdmin'),
};

// Track which routes have already been prefetched so we don't duplicate
const prefetched = new Set<string>();

/**
 * Prefetch a route's JS chunk. Safe to call multiple times — only
 * triggers the import once per route per session.
 */
export function prefetchRoute(path: string) {
    if (prefetched.has(path)) return;
    const loader = routeImportMap[path];
    if (loader) {
        prefetched.add(path);
        loader(); // Fire-and-forget — the browser caches the module
    }
}

/**
 * Eagerly preload the most commonly visited routes during idle time.
 * Call this once after the app has fully mounted.
 */
export function preloadCommonRoutes() {
    const common = ['/dashboard', '/voice-recording', '/klinika-admin', '/profile'];
    const load = () => {
        common.forEach((path) => prefetchRoute(path));
    };

    // Use requestIdleCallback if available, otherwise setTimeout
    if ('requestIdleCallback' in window) {
        (window as any).requestIdleCallback(load, { timeout: 3000 });
    } else {
        setTimeout(load, 1500);
    }
}
