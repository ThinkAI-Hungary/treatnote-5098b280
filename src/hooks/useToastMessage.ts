import { useHeaderMessage } from '@/hooks/useHeaderMessage';
import { toast as sonnerToast } from 'sonner';

type ToastFunction = (msg: string) => void;

interface ToastInterceptor {
  (msg: string): void;
  success: ToastFunction;
  error: ToastFunction;
  info: ToastFunction;
  warning: ToastFunction;
  promise: typeof sonnerToast.promise;
  dismiss: typeof sonnerToast.dismiss;
}

export const toast: ToastInterceptor = Object.assign(
  (msg: string) => { useHeaderMessage.getState().showMessage(msg, 'info'); },
  {
    success: (msg: string) => useHeaderMessage.getState().showMessage(msg, 'success'),
    error: (msg: string) => useHeaderMessage.getState().showMessage(msg, 'error'),
    info: (msg: string) => useHeaderMessage.getState().showMessage(msg, 'info'),
    warning: (msg: string) => useHeaderMessage.getState().showMessage(msg, 'error'),
    promise: sonnerToast.promise,
    dismiss: sonnerToast.dismiss,
  }
);
