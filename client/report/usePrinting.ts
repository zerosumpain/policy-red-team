import { useEffect, useState } from 'react';

/**
 * TRUE WHILE THE BROWSER IS MAKING A PAGE OF THIS.
 *
 * A capped list renders only its first rows, so the rest are not in the
 * document at all and no print stylesheet can reach them — the write-up lost
 * 1,701px of the assessment's own prose from the paper copy that way before
 * this hook existed. `beforeprint` lets a component render everything for the
 * printed copy and restore the screen afterwards.
 */
export function usePrinting(): boolean {
  const [printing, setPrinting] = useState(false);
  useEffect(() => {
    const on = () => setPrinting(true);
    const off = () => setPrinting(false);
    window.addEventListener('beforeprint', on);
    window.addEventListener('afterprint', off);
    return () => {
      window.removeEventListener('beforeprint', on);
      window.removeEventListener('afterprint', off);
    };
  }, []);
  return printing;
}
