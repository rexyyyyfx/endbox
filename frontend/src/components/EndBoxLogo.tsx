import { motion } from 'framer-motion';

interface EndBoxLogoProps {
  size?: number;
  className?: string;
  pulse?: boolean;
}

export function EndBoxLogo({ size = 48, className = '', pulse = true }: EndBoxLogoProps) {
  return (
    <motion.div
      className={className}
      style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}
      animate={
        pulse
          ? {
              filter: [
                'drop-shadow(0 0 0px rgba(34,197,94,0))',
                'drop-shadow(0 0 12px rgba(34,197,94,0.7))',
                'drop-shadow(0 0 0px rgba(34,197,94,0))',
              ],
            }
          : {}
      }
      transition={pulse ? { duration: 2.5, repeat: Infinity, ease: 'easeInOut' } : {}}
    >
      <svg
        width={size}
        height={size}
        viewBox="0 0 48 48"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        {/* Lock shackle */}
        <rect x="16" y="8" width="16" height="4" fill="#22c55e" />
        <rect x="12" y="12" width="4" height="12" fill="#22c55e" />
        <rect x="32" y="12" width="4" height="12" fill="#22c55e" />
        {/* Lock body */}
        <rect x="8" y="22" width="32" height="22" fill="#22c55e" />
        {/* Keyhole outer */}
        <rect x="20" y="30" width="8" height="6" fill="#0a0a0a" />
        {/* Keyhole shaft */}
        <rect x="22" y="36" width="4" height="4" fill="#0a0a0a" />
        {/* Corner pixel details */}
        <rect x="8" y="22" width="4" height="4" fill="#16a34a" />
        <rect x="36" y="22" width="4" height="4" fill="#16a34a" />
        <rect x="8" y="40" width="4" height="4" fill="#16a34a" />
        <rect x="36" y="40" width="4" height="4" fill="#16a34a" />
        {/* Shine */}
        <rect x="10" y="24" width="2" height="6" fill="#4ade80" opacity="0.5" />
      </svg>
    </motion.div>
  );
}
