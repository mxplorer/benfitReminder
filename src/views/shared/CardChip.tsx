interface CardChipProps {
  color: string;
  size?: "small" | "normal";
}

const SIZES = {
  small: { width: 28, height: 18, radius: 3 },
  normal: { width: 40, height: 26, radius: 4 },
} as const;

export const CardChip = ({ color, size = "normal" }: CardChipProps) => {
  const { width, height, radius } = SIZES[size];
  return (
    <div
      style={{
        width,
        height,
        borderRadius: radius,
        background: `linear-gradient(135deg, ${color}, ${color}88)`,
        flexShrink: 0,
      }}
    />
  );
};
