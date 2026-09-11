/** Event-driven focus only: layout/resize changes never move a reader by themselves. */
export function createChatScroll(viewport: HTMLElement) {
  let readingHistory = false;
  let frame = 0;
  const interrupt = () => { readingHistory = true; cancelAnimationFrame(frame); };
  const onKey = (event: KeyboardEvent) => {
    if (["ArrowUp", "ArrowDown", "PageUp", "PageDown", "Home", "End"].includes(event.key)) interrupt();
  };
  const onScroll = () => {
    if (viewport.scrollHeight - viewport.clientHeight - viewport.scrollTop <= 100) readingHistory = false;
  };
  viewport.addEventListener("wheel", interrupt, { passive: true });
  viewport.addEventListener("touchstart", interrupt, { passive: true });
  viewport.addEventListener("pointerdown", interrupt, { passive: true });
  viewport.addEventListener("keydown", onKey);
  viewport.addEventListener("scroll", onScroll, { passive: true });
  return {
    schedule(target: HTMLElement | null, force = false, block: ScrollLogicalPosition = "start") {
      if (force) readingHistory = false;
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        if (!target?.isConnected || readingHistory) return;
        target.scrollIntoView({ behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth", block });
      });
    },
    dispose() {
      cancelAnimationFrame(frame);
      viewport.removeEventListener("wheel", interrupt);
      viewport.removeEventListener("touchstart", interrupt);
      viewport.removeEventListener("pointerdown", interrupt);
      viewport.removeEventListener("keydown", onKey);
      viewport.removeEventListener("scroll", onScroll);
    },
  };
}
