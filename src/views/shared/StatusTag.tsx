import { getTagState } from "./statusTagUtils";

interface StatusTagProps {
  daysRemaining: number | null;
  isUsed: boolean;
  usedDate?: string;
  notYetActive?: boolean;
  reminderDays?: number;
}

export const StatusTag = ({ daysRemaining, isUsed, notYetActive, reminderDays }: StatusTagProps) => {
  const { text, className } = getTagState(daysRemaining, isUsed, notYetActive, reminderDays);
  return <span className={`status-tag ${className}`}>{text}</span>;
};
