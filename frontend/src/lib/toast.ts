import { toast as sonnerToast } from 'sonner';

// Toast options type
type ToastOptions = {
  id?: string;
  description?: string;
  duration?: number;
  style?: Record<string, any>;
  className?: string;
  txHash?: string; // Transaction hash for block explorer link
  action?: {
    label: string;
    onClick: () => void;
  };
  [key: string]: any;
};

// Block explorer URL for Polygon Amoy
const BLOCK_EXPLORER_URL = 'https://amoy.polygonscan.com';

// Custom toast with app theme
const customToastStyles: ToastOptions = {
  style: {
    background: 'rgba(10, 10, 15, 0.95)',
    border: '1px solid rgba(59, 130, 246, 0.3)',
    color: '#e5e7eb',
    backdropFilter: 'blur(8px)',
  },
  className: 'font-mono text-sm',
};

// Deduplicate toasts by ID
const shownToasts = new Set<string>();
const TOAST_COOLDOWN = 3000; // 3 seconds between same toast

// Helper to create action button for transaction link
const createTxAction = (txHash: string) => ({
  label: 'View TX',
  onClick: () => {
    window.open(`${BLOCK_EXPLORER_URL}/tx/${txHash}`, '_blank');
  },
});

export const toast = {
  success: (message: string, options?: ToastOptions) => {
    const toastId = options?.id || message;
    if (shownToasts.has(toastId)) return;
    
    shownToasts.add(toastId);
    setTimeout(() => shownToasts.delete(toastId), TOAST_COOLDOWN);
    
    // Add transaction link if txHash provided
    const finalOptions = { ...options };
    if (options?.txHash && !options?.action) {
      finalOptions.action = createTxAction(options.txHash);
    }
    
    return sonnerToast.success(message, {
      ...customToastStyles,
      ...finalOptions,
      style: {
        ...customToastStyles.style,
        borderColor: 'rgba(34, 197, 94, 0.5)',
        ...finalOptions?.style,
      },
    });
  },
  
  error: (message: string, options?: ToastOptions) => {
    const toastId = options?.id || message;
    if (shownToasts.has(toastId)) return;
    
    shownToasts.add(toastId);
    setTimeout(() => shownToasts.delete(toastId), TOAST_COOLDOWN);
    
    // Add transaction link if txHash provided
    const finalOptions = { ...options };
    if (options?.txHash && !options?.action) {
      finalOptions.action = createTxAction(options.txHash);
    }
    
    return sonnerToast.error(message, {
      ...customToastStyles,
      ...finalOptions,
      style: {
        ...customToastStyles.style,
        borderColor: 'rgba(239, 68, 68, 0.5)',
        ...finalOptions?.style,
      },
    });
  },
  
  warning: (message: string, options?: ToastOptions) => {
    const toastId = options?.id || message;
    if (shownToasts.has(toastId)) return;
    
    shownToasts.add(toastId);
    setTimeout(() => shownToasts.delete(toastId), TOAST_COOLDOWN);
    
    // Add transaction link if txHash provided
    const finalOptions = { ...options };
    if (options?.txHash && !options?.action) {
      finalOptions.action = createTxAction(options.txHash);
    }
    
    return sonnerToast.warning(message, {
      ...customToastStyles,
      ...finalOptions,
      style: {
        ...customToastStyles.style,
        borderColor: 'rgba(234, 179, 8, 0.5)',
        ...finalOptions?.style,
      },
    });
  },
  
  info: (message: string, options?: ToastOptions) => {
    const toastId = options?.id || message;
    if (shownToasts.has(toastId)) return;
    
    shownToasts.add(toastId);
    setTimeout(() => shownToasts.delete(toastId), TOAST_COOLDOWN);
    
    // Add transaction link if txHash provided
    const finalOptions = { ...options };
    if (options?.txHash && !options?.action) {
      finalOptions.action = createTxAction(options.txHash);
    }
    
    return sonnerToast.info(message, {
      ...customToastStyles,
      ...finalOptions,
      style: {
        ...customToastStyles.style,
        borderColor: 'rgba(59, 130, 246, 0.5)',
        ...finalOptions?.style,
      },
    });
  },
};
