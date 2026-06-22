import { ChatWidget } from "@/components/chat-widget";

export default function Home() {
  return (
    <div className="min-h-[100dvh] w-full flex items-center justify-center bg-[#0B0F15] p-0 md:p-6 lg:p-8 bg-[url('https://www.transparenttextures.com/patterns/stardust.png')]">
      <div className="w-full h-[100dvh] md:h-[700px] md:max-w-[460px] bg-background md:rounded-[2rem] shadow-2xl overflow-hidden md:border border-border/50 flex flex-col relative z-10">
        <ChatWidget />
      </div>
    </div>
  );
}
