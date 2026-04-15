import type { ReactNode } from "react";

interface GlassContainerProps {
  children: ReactNode;
  variant?: "panel" | "card";
  className?: string;
  onClick?: () => void;
}

export const GlassContainer = ({
  children,
  variant = "card",
  className = "",
  onClick,
}: GlassContainerProps) => {
  const baseClass = variant === "panel" ? "glass-panel" : "glass-card";
  return <div className={`${baseClass} ${className}`.trim()} onClick={onClick}>{children}</div>;
};
