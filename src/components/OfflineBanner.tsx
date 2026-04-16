import { WifiOff } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useNetworkStatus } from '@/hooks/useNetworkStatus';

interface OfflineBannerProps {
  /** Optional count of queued operations to surface to the user. */
  pendingCount?: number;
}

/**
 * Fixed top banner that slides in when the device loses connectivity.
 * Mount once at the app root — it self-manages visibility.
 */
export const OfflineBanner = ({ pendingCount = 0 }: OfflineBannerProps) => {
  const { isOnline } = useNetworkStatus();

  return (
    <AnimatePresence>
      {!isOnline && (
        <motion.div
          key="offline-banner"
          initial={{ y: -56, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: -56, opacity: 0 }}
          transition={{ type: 'spring', damping: 28, stiffness: 280 }}
          className="fixed top-0 inset-x-0 z-[300] flex items-center justify-center gap-2 bg-destructive text-destructive-foreground text-xs font-semibold py-2.5 px-4"
          role="status"
          aria-live="polite"
        >
          <WifiOff className="w-3.5 h-3.5 shrink-0" />
          <span>
            You're offline
            {pendingCount > 0
              ? ` · ${pendingCount} action${pendingCount !== 1 ? 's' : ''} queued`
              : ' · reconnecting…'}
          </span>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default OfflineBanner;
