import { createContext, useContext, useState, ReactNode, useCallback, useEffect, useRef } from 'react';

interface PageLoadingContextType {
    isPageLoading: boolean;
    setPageLoading: (loading: boolean) => void;
}

const PageLoadingContext = createContext<PageLoadingContextType>({
    isPageLoading: false,
    setPageLoading: () => { },
});

export function PageLoadingProvider({ children }: { children: ReactNode }) {
    const [isPageLoading, setPageLoading] = useState(false);

    return (
        <PageLoadingContext.Provider value={{ isPageLoading, setPageLoading }}>
            {children}
        </PageLoadingContext.Provider>
    );
}

export function usePageLoading() {
    return useContext(PageLoadingContext);
}

/**
 * Hook for page components to signal they are loading.
 * Automatically sets/clears the sidebar loading indicator.
 */
export function usePageLoadingSignal(isLoading: boolean) {
    const { setPageLoading } = usePageLoading();

    // Always sync loading state to context (fires on mount and on change)
    useEffect(() => {
        setPageLoading(isLoading);
    }, [isLoading, setPageLoading]);

    // Clear on unmount
    useEffect(() => {
        return () => setPageLoading(false);
    }, [setPageLoading]);
}
