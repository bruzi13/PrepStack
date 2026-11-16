// Port of tasteskill's "liquid-type" moment: a very large headline ripples under the pointer through one SVG
// displacement filter, applied only while the ripple is alive. Touch, reduced motion: plain type.
import { useEffect, useRef } from "react";

let uid = 0;
const clamp = (v: number, a = 0, b = 1) => Math.min(b, Math.max(a, v));

export function useLiquidType<T extends HTMLElement>(strength = 1, reach = 0.3) {
  const ref = useRef<T>(null);
  useEffect(() => {
    const root = ref.current;
    if (!root) return;
    const type = (root.matches(".lp-word, h1, h2") ? root : root.querySelector(".lp-word, h1, h2")) as HTMLElement | null;
    if (!type) return;
    if (matchMedia("(prefers-reduced-motion: reduce)").matches || matchMedia("(pointer: coarse)").matches) return;
    if (typeof SVGFEDisplacementMapElement === "undefined") return;
    const ns = "http://www.w3.org/2000/svg", id = `lt-${++uid}`;
    const svg = document.createElementNS(ns, "svg");
    svg.setAttribute("width", "0"); svg.setAttribute("height", "0"); svg.setAttribute("aria-hidden", "true");
    svg.style.cssText = "position:absolute;pointer-events:none";
    svg.innerHTML = `<filter id="${id}" x="-5%" y="-20%" width="110%" height="140%" color-interpolation-filters="sRGB"><feTurbulence type="fractalNoise" baseFrequency="0.006 0.013" numOctaves="1" seed="7"/><feDisplacementMap in="SourceGraphic" scale="0" xChannelSelector="R" yChannelSelector="G"/></filter>`;
    document.body.append(svg);
    const turb = svg.querySelector("feTurbulence")!, disp = svg.querySelector("feDisplacementMap")!;
    let energy = 0, raf = 0, on = false, lastX = 0, lastY = 0, hasLast = false, t0 = 0, px = 0.5;
    const apply = () => {
      const sc = Math.min(44, energy) * strength;
      if (sc < 0.6) { if (on) { type.style.filter = ""; on = false; } return false; }
      disp.setAttribute("scale", sc.toFixed(1));
      const dx = 0.006 + (px - 0.5) * 0.002, dy = 0.013 + Math.sin(t0 / 700) * 0.003;
      turb.setAttribute("baseFrequency", `${dx.toFixed(4)} ${dy.toFixed(4)}`);
      if (!on) { type.style.filter = `url(#${id})`; on = true; }
      return true;
    };
    const tick = (now: number) => { raf = 0; t0 = now; energy *= 0.93; if (apply()) raf = requestAnimationFrame(tick); else energy = 0; };
    const move = (e: PointerEvent) => {
      const r = type.getBoundingClientRect(), x = e.clientX - r.left, y = e.clientY - r.top;
      if (!(x > -r.width * 0.04 && x < r.width * 1.04 && y > -r.height * 0.2 && y < r.height * 1.2)) { hasLast = false; return; }
      px = clamp(x / r.width);
      if (hasLast) energy = Math.min(44, energy + Math.min(9, Math.hypot(e.clientX - lastX, e.clientY - lastY) * 0.3) * (0.5 + reach));
      lastX = e.clientX; lastY = e.clientY; hasLast = true;
      if (!raf) raf = requestAnimationFrame(tick);
    };
    const leave = () => { hasLast = false; };
    root.addEventListener("pointermove", move, { passive: true });
    root.addEventListener("pointerleave", leave);
    return () => { root.removeEventListener("pointermove", move); root.removeEventListener("pointerleave", leave); if (raf) cancelAnimationFrame(raf); type.style.filter = ""; svg.remove(); };
  }, [strength, reach]);
  return ref;
}
