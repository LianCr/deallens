"use client";

/**
 * Odometer-style number ticker, ported from smart-money-decoder.
 * Each digit lives on a vertical reel; changing digits translate the
 * reel along the shortest wrap-around path (9→0 rolls forward, never
 * rewinds). Transform-only animation, zero dependencies.
 */
import { useEffect, useRef, useState } from "react";
import styles from "./RollingNumber.module.css";

const REEL = 80;
const MID = 40;

function RollingDigit({ digit }: { digit: number }) {
  const positionRef = useRef(MID); // mount at 40 (shows 0), roll to target
  const [position, setPosition] = useState(MID);

  useEffect(() => {
    const current = positionRef.current;
    const currentDigit = ((current % 10) + 10) % 10;
    let delta = digit - currentDigit;
    if (delta > 5) delta -= 10;
    else if (delta < -5) delta += 10;
    positionRef.current = current + delta;
    setPosition(current + delta);
  }, [digit]);

  return (
    <span className={styles.digit}>
      <span className={styles.reel} style={{ transform: `translateY(${-position}em)` }}>
        {Array.from({ length: REEL }, (_, n) => (
          <span key={n} className={styles.cell}>
            {n % 10}
          </span>
        ))}
      </span>
    </span>
  );
}

/** Rolls the digits of a formatted value; non-digits render statically. */
export function RollingNumber({ value }: { value: string }) {
  return (
    <span className={styles.group} aria-label={value}>
      {value.split("").map((char, i) =>
        /\d/.test(char) ? (
          <RollingDigit key={`${i}`} digit={Number(char)} />
        ) : (
          <span key={`${i}`} aria-hidden>
            {char}
          </span>
        ),
      )}
    </span>
  );
}
