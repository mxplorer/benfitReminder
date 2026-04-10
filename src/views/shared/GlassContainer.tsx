import type { ReactNode } from "react";

interface GlassContainerProps {
  children: ReactNode;
  variant?: "panel" | "card";
  className?: string;
}

export const GlassContainer = ({
  children,
  variant = "card",
  className = "",
}: GlassContainerProps) => {
  const baseClass = variant === "panel" ? "glass-panel" : "glass-card";
  return <div className={`${baseClass} ${className}`.trim()}>{children}</div>;
};
