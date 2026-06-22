import { ChatWidget } from "@/components/chat-widget";

export default function Home() {
  return (
    <div className="min-h-[100dvh] w-full flex items-center justify-center bg-background p-0 md:p-6 lg:p-8 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-white to-background">
      <div className="w-full h-[100dvh] md:h-[700px] md:max-w-[480px] bg-card md:rounded-[2rem] shadow-xl overflow-hidden md:border border-border flex flex-col relative z-10">
        <ChatWidget />
      </div>
    </div>
  );
}
