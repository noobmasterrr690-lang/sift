export function formatBytes(bytes: number, decimals = 2): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  const k = 1024;
  const dm = Math.max(0, decimals);
  const sizes = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.min(
    sizes.length - 1,
    Math.floor(Math.log(bytes) / Math.log(k))
  );
  const value = bytes / Math.pow(k, i);
  return `${value.toFixed(i === 0 ? 0 : dm)} ${sizes[i]}`;
}

export function formatRelativeDate(unixSeconds: number): string {
  const now = Math.floor(Date.now() / 1000);
  const diff = Math.max(0, now - unixSeconds);

  if (diff < 60) return "Just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  const days = Math.floor(diff / 86400);
  if (days < 30) return `${days}d ago`;
  const date = new Date(unixSeconds * 1000);
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function formatExactTimestamp(unixSeconds: number): string {
  const date = new Date(unixSeconds * 1000);
  return date.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function getWcsBadgeStyle(score: number): {
  bg: string;
  text: string;
  border: string;
  severity: string;
} {
  if (score >= 90) {
    return {
      bg: "bg-rose-500/15",
      text: "text-rose-300",
      border: "border-rose-500/30",
      severity: "Critical Waste",
    };
  }
  if (score >= 80) {
    return {
      bg: "bg-amber-500/15",
      text: "text-amber-300",
      border: "border-amber-500/30",
      severity: "High Clutter",
    };
  }
  return {
    bg: "bg-indigo-500/15",
    text: "text-indigo-300",
    border: "border-indigo-500/30",
    severity: "Stale Candidate",
  };
}
