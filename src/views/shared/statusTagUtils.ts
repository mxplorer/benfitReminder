export interface TagState {
  text: string;
  className: string;
}

export const getTagState = (
  daysRemaining: number | null,
  isUsed: boolean,
  notYetActive = false,
  reminderDays = 3,
): TagState => {
  if (notYetActive && !isUsed) {
    return { text: "未激活", className: "status-tag--pending" };
  }

  if (isUsed) {
    return { text: "已使用", className: "status-tag--done" };
  }

  if (daysRemaining === null) {
    return { text: "可用", className: "status-tag--warning" };
  }

  const text = `剩 ${String(daysRemaining)} 天`;

  if (daysRemaining <= reminderDays) {
    return { text, className: "status-tag--danger" };
  }
  return { text, className: "status-tag--warning" };
};
