import React from "react";
import { motion } from "framer-motion";

interface SplashScreenProps {
  statusText?: string;
  progress?: number | null;
}

export const SplashScreen: React.FC<SplashScreenProps> = ({
  statusText = "Scanning PC folders…",
  progress = null,
}) => {
  return (
    <motion.div
      key="sift-splash-screen"
      initial={{ opacity: 1 }}
      exit={{
        opacity: 0,
        scale: 1.03,
        transition: { duration: 0.5, ease: [0.16, 1, 0.3, 1] },
      }}
      className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-[#090a12] overflow-hidden select-none"
      style={{
        background:
          "radial-gradient(120% 90% at 50% 20%, #1a1e36 0%, #101222 45%, #080910 100%)",
      }}
      role="status"
      aria-label="Loading Sift"
    >
      {/* Ambient glowing blurred orbs */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden" aria-hidden="true">
        <motion.div
          animate={{
            x: [0, 50, 0],
            y: [0, 30, 0],
            scale: [1, 1.1, 1],
          }}
          transition={{ duration: 8, repeat: Infinity, ease: "easeInOut" }}
          className="absolute -top-32 -left-28 w-[480px] h-[480px] rounded-full bg-cyan-400/20 blur-[130px]"
        />
        <motion.div
          animate={{
            x: [0, -40, 0],
            y: [0, -30, 0],
            scale: [1, 1.08, 1],
          }}
          transition={{ duration: 10, repeat: Infinity, ease: "easeInOut" }}
          className="absolute -bottom-36 -right-24 w-[520px] h-[520px] rounded-full bg-indigo-600/25 blur-[140px]"
        />
        <motion.div
          animate={{
            x: [0, -30, 0],
            y: [0, 35, 0],
            scale: [1, 1.15, 1],
          }}
          transition={{ duration: 9, repeat: Infinity, ease: "easeInOut" }}
          className="absolute top-1/2 left-2/3 w-[360px] h-[360px] rounded-full bg-rose-500/15 blur-[120px]"
        />
      </div>

      {/* Main Center Content */}
      <div className="relative z-10 flex flex-col items-center text-center px-4">
        {/* Logo Emblem with Glow */}
        <div className="relative w-24 h-24 flex items-center justify-center mb-5">
          <motion.div
            animate={{
              scale: [0.95, 1.15, 0.95],
              opacity: [0.45, 0.8, 0.45],
            }}
            transition={{ duration: 2.8, repeat: Infinity, ease: "easeInOut" }}
            className="absolute inset-[-18px] rounded-full bg-gradient-to-r from-indigo-500/40 via-cyan-400/20 to-purple-500/40 blur-xl"
            aria-hidden="true"
          />
          <motion.img
            src="/sift-logo.svg"
            alt="Sift"
            width={84}
            height={84}
            initial={{ opacity: 0, scale: 0.75, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            transition={{ duration: 0.6, ease: [0.34, 1.56, 0.64, 1] }}
            className="w-[84px] h-[84px] rounded-[20px] shadow-2xl shadow-indigo-600/50 relative z-10"
            onError={(e) => {
              // Fallback to favicon or banner if svg path differs
              const target = e.currentTarget;
              if (target.src.endsWith(".svg")) {
                target.src = "/favicon.png";
              }
            }}
          />
        </div>

        {/* Brand Wordmark & Tagline */}
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15, duration: 0.5 }}
          className="flex flex-col items-center gap-1.5"
        >
          <h1 className="text-4xl font-extrabold tracking-tight text-white drop-shadow-md">
            Sift
          </h1>
          <span className="text-[10px] font-bold tracking-[0.26em] uppercase bg-gradient-to-r from-sky-400 via-indigo-400 to-pink-500 bg-clip-text text-transparent pl-[0.26em]">
            Precision File Organizer
          </span>
        </motion.div>

        {/* Progress Track */}
        <div
          className="w-60 h-1 bg-white/[0.08] rounded-full overflow-hidden mt-6 relative shadow-inner"
          aria-hidden="true"
        >
          {progress !== null ? (
            <motion.div
              className="absolute top-0 left-0 h-full rounded-full bg-gradient-to-r from-cyan-400 via-indigo-500 via-purple-500 to-rose-400 shadow-[0_0_12px_rgba(99,102,241,0.6)]"
              initial={{ width: "0%" }}
              animate={{ width: `${progress}%` }}
              transition={{ duration: 0.25, ease: "easeOut" }}
            />
          ) : (
            <motion.div
              className="absolute top-0 h-full rounded-full bg-gradient-to-r from-cyan-400 via-indigo-500 via-purple-500 to-rose-400 shadow-[0_0_12px_rgba(99,102,241,0.6)]"
              animate={{
                left: ["-35%", "25%", "100%"],
                width: ["25%", "50%", "25%"],
              }}
              transition={{
                duration: 1.8,
                repeat: Infinity,
                ease: [0.4, 0, 0.2, 1],
              }}
            />
          )}
        </div>

        {/* Dynamic Status Text */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.2, duration: 0.4 }}
          className="flex items-center justify-center gap-2 mt-3.5 text-xs text-zinc-400 font-medium tracking-wide"
        >
          <span
            className="w-1.5 h-1.5 rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.8)] animate-pulse"
            aria-hidden="true"
          />
          <span>{statusText}</span>
        </motion.div>

        {/* Safety & Architecture Badges */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.3, duration: 0.5 }}
          className="flex items-center gap-2 mt-8 text-[11px] text-zinc-500 font-medium tracking-wide"
          aria-hidden="true"
        >
          <span>⚡ 100% Local</span>
          <span className="text-indigo-400/50">•</span>
          <span>Private</span>
          <span className="text-indigo-400/50">•</span>
          <span>Windows Native</span>
        </motion.div>
      </div>
    </motion.div>
  );
};

