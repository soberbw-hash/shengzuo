export const BrandMark = ({ compact = false }: { compact?: boolean }) => (
  <div className={compact ? "brand-mark brand-mark--compact" : "brand-mark"}>
    <img src="./brand/app-icon.png" alt="" aria-hidden="true" />
  </div>
);
