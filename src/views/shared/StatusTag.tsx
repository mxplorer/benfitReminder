import { getTagState } from "./statusTagUtils";

interface StatusTagProps {
  daysRemaining: number | null;
  isUsed: boolean;
  usedDate?: string;
}

export const StatusTag = ({ daysRemaining, isUsed }: StatusTagProps) => {
  const { text, className } = getTagState(daysRemaining, isUsed);
  return <span className={`status-tag ${className}`}>{text}</span>;
};
