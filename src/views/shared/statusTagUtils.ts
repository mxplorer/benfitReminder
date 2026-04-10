export interface TagState {
  text: string;
  className: string;
}

export const getTagState = (daysRemaining: number | null, isUsed: boolean): TagState => {
  if (isUsed) {
    return { text: "已使用", className: "status-tag--done" };
  }

  if (daysRemaining === null) {
    return { text: "可用", className: "status-tag--safe" };
  }

  const text = `剩 ${String(daysRemaining)} 天`;

  if (daysRemaining <= 7) {
    return { text, className: "status-tag--danger" };
  }
  if (daysRemaining <= 30) {
    return { text, className: "status-tag--warning" };
  }
  return { text, className: "status-tag--safe" };
};
