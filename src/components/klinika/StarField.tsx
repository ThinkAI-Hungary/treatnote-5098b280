import { memo, useMemo } from 'react';

interface Star {
  id: number;
  left: number;
  top: number;
  delay: number;
  size: number;
}

// Memoized StarField component - prevents re-renders when table data changes
export const StarField = memo(function StarField() {
  const stars = useMemo<Star[]>(() => {
    return Array.from({ length: 50 }, (_, i) => ({
      id: i,
      left: Math.random() * 100,
      top: Math.random() * 100,
      delay: Math.random() * 3,
      size: Math.random() * 2 + 1,
    }));
  }, []);

  return (
    <div className="star-field" aria-hidden="true">
      {stars.map((star) => (
        <div
          key={star.id}
          className="star"
          style={{
            left: `${star.left}%`,
            top: `${star.top}%`,
            width: `${star.size}px`,
            height: `${star.size}px`,
            animationDelay: `${star.delay}s`,
            willChange: 'opacity',
          }}
        />
      ))}
    </div>
  );
});
