import { useEffect, useRef } from "react";
import { ChatWidget } from "@/components/chat-widget";

export default function Home() {
  const pageRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const viewport = window.visualViewport;
    const resize = () => pageRef.current?.style.setProperty("--chat-viewport-height", `${viewport?.height ?? window.innerHeight}px`);
    resize();
    viewport?.addEventListener("resize", resize);
    window.addEventListener("resize", resize);
    return () => { viewport?.removeEventListener("resize", resize); window.removeEventListener("resize", resize); };
  }, []);
  return (
    <div ref={pageRef} className="chat-page bg-background flex items-center justify-center">
      <div className="chat-shell w-full bg-card rounded-lg border border-border shadow-sm overflow-hidden flex flex-col relative z-10">
        <ChatWidget />
      </div>
    </div>
  );
}
