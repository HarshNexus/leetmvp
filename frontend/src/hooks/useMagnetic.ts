import { useRef } from 'react';

// Cursor-follow tilt used on bento tiles. Skips the effect entirely when the
// user has asked for reduced motion.
export function useMagnetic<T extends HTMLElement>() {
  const ref = useRef<T | null>(null);
  const onMouseMove = (event: React.MouseEvent<T>) => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const node = ref.current;
    if (!node) return;
    const rect = node.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    node.style.setProperty('--mx', `${x}px`);
    node.style.setProperty('--my', `${y}px`);
    const rx = ((y / rect.height) - 0.5) * -5;
    const ry = ((x / rect.width) - 0.5) * 5;
    node.style.transform = `perspective(600px) rotateX(${rx}deg) rotateY(${ry}deg) translateY(-2px)`;
  };
  const onMouseLeave = () => { if (ref.current) ref.current.style.transform = ''; };
  return { ref, onMouseMove, onMouseLeave };
}
