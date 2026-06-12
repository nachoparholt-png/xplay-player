/**
 * CreateFab — the single, consistent entry point into creation workflows.
 * ───────────────────────────────────────────────────────────────────────
 * Expanding floating action button (bottom-right): shows "+ <label>" at the
 * top of the page, collapses to a round "+" while scrolling down, re-expands
 * on scroll-up. Extracted from TournamentsList so Matches and Tournaments
 * share identical create UX (user feedback, 12 Jun 2026).
 */
import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Plus } from "lucide-react";

interface CreateFabProps {
  label?: string;
  onClick: () => void;
}

const CreateFab = ({ label = "Create", onClick }: CreateFabProps) => {
  const [expanded, setExpanded] = useState(true);
  const lastScrollY = useRef(0);

  useEffect(() => {
    const onScroll = () => {
      const currentY = window.scrollY;
      if (currentY < 10) setExpanded(true);
      else if (currentY > lastScrollY.current + 5) setExpanded(false);
      else if (currentY < lastScrollY.current - 5) setExpanded(true);
      lastScrollY.current = currentY;
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <motion.button
      onClick={onClick}
      aria-label={label}
      className="fixed bottom-24 right-5 lg:bottom-8 lg:right-8 z-40 flex items-center justify-center bg-primary text-primary-foreground font-display font-black text-sm overflow-hidden h-14 glow-primary"
      style={{ minWidth: 56 }}
      whileTap={{ scale: 0.9 }}
      initial={{ scale: 0, opacity: 0 }}
      animate={{
        scale: 1,
        opacity: 1,
        width: expanded ? 160 : 56,
        borderRadius: 9999,
        paddingLeft: expanded ? 20 : 0,
        paddingRight: expanded ? 20 : 0,
      }}
      transition={{ duration: 0.25, ease: "easeInOut" }}
    >
      <Plus className="w-6 h-6 flex-shrink-0" />
      <AnimatePresence>
        {expanded && (
          <motion.span
            key="label"
            initial={{ width: 0, opacity: 0, marginLeft: 0 }}
            animate={{ width: "auto", opacity: 1, marginLeft: 8 }}
            exit={{ width: 0, opacity: 0, marginLeft: 0 }}
            transition={{ duration: 0.2 }}
            className="whitespace-nowrap overflow-hidden"
          >
            {label}
          </motion.span>
        )}
      </AnimatePresence>
    </motion.button>
  );
};

export default CreateFab;
