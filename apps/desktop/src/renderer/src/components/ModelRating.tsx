import { Star } from "lucide-react";

type ModelRatingProps = {
  value: number;
  label: string;
};

const STAR_COUNT = 5;

export const ModelRating = ({ value, label }: ModelRatingProps) => (
  <div
    className="model-rating"
    aria-label={`综合推荐度 ${value.toFixed(1)} 分（满分 5 分），${label}`}
  >
    <span className="model-rating__label">综合推荐度</span>
    <span className="model-rating__stars" aria-hidden="true">
      {Array.from({ length: STAR_COUNT }, (_, index) => {
        const fill = Math.max(0, Math.min(1, value - index));
        return (
          <span className="model-rating__star" key={index}>
            <Star />
            <span style={{ width: `${fill * 100}%` }}>
              <Star />
            </span>
          </span>
        );
      })}
    </span>
    <strong>{value.toFixed(1)}</strong>
    <small>{label}</small>
  </div>
);
