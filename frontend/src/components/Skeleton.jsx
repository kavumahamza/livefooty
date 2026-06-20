/**
 * Skeleton — shimmer placeholder for loading states.
 *
 * Props:
 *   width    {string|number}  — CSS width  (default '100%')
 *   height   {string|number}  — CSS height (default '1em')
 *   radius   {string|number}  — CSS border-radius (default var(--r-sm))
 *   className {string}        — additional class names
 *
 * Renders a div with the `.shimmer` utility class applied.
 * Size is set via inline style so it can accept any CSS unit.
 */
export function Skeleton({ width = '100%', height = '1em', radius, className = '' }) {
  const style = {
    width: typeof width === 'number' ? `${width}px` : width,
    height: typeof height === 'number' ? `${height}px` : height,
    ...(radius != null
      ? { borderRadius: typeof radius === 'number' ? `${radius}px` : radius }
      : {}),
  };

  return (
    <div
      className={`shimmer${className ? ` ${className}` : ''}`}
      style={style}
      aria-hidden="true"
    />
  );
}

export default Skeleton;
