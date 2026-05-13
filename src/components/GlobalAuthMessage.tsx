import { useLocation } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { useHeaderMessage } from '@/hooks/useHeaderMessage';
import { CheckCircle2, AlertCircle, Info } from 'lucide-react';

export function GlobalAuthMessage() {
  const { message, type } = useHeaderMessage();
  const location = useLocation();
  
  const isPublic = 
    location.pathname === '/' || 
    location.pathname.startsWith('/auth') || 
    location.pathname.startsWith('/register') || 
    location.pathname.startsWith('/solo-register');

  if (!isPublic) return null;

  return (
    <div className="fixed top-6 left-1/2 -translate-x-1/2 z-[9999] pointer-events-none">
      <AnimatePresence mode="wait">
        {message ? (
          <motion.div
            key="global-auth-message"
            initial={{ y: -40, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: -40, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 500, damping: 30 }}
            className="flex items-center gap-2 px-4 py-1.5 rounded-full text-sm font-medium shadow-md border border-gray-200 bg-white text-black pointer-events-auto"
          >
            {type === 'success' && <CheckCircle2 className="h-4 w-4 text-emerald-600" />}
            {type === 'error' && <AlertCircle className="h-4 w-4 text-red-600" />}
            {type === 'info' && <Info className="h-4 w-4 text-blue-600" />}
            {message}
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
