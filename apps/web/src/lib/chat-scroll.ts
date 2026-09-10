/** One controller per mounted scroll viewport. No state updates during scroll. */
export function createChatScroll(viewport: HTMLElement, bottom: HTMLElement) {
  let following = true;
  let lastTop = viewport.scrollTop;
  let frame = 0;
  let target = bottom;
  const onScroll = () => {
    const nearBottom = viewport.scrollHeight - viewport.clientHeight - viewport.scrollTop <= 100;
    if (viewport.scrollTop < lastTop - 2 && !nearBottom) following = false;
    else if (nearBottom) following = true;
    lastTop = viewport.scrollTop;
  };
  const schedule = (force = false, nextTarget = target) => {
    target = nextTarget;
    if (force) following = true;
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(() => {
      if (!following) return;
      target.scrollIntoView({ behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth", block: "end" });
    });
  };
  viewport.addEventListener("scroll", onScroll, { passive: true });
  const observer = new ResizeObserver(() => schedule());
  observer.observe(viewport);
  if (bottom.parentElement) observer.observe(bottom.parentElement);
  return { schedule, dispose() {
    cancelAnimationFrame(frame);
    observer.disconnect();
    viewport.removeEventListener("scroll", onScroll);
  } };
}
