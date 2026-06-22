import { ChatWidget } from "@/components/chat-widget";

export default function Home() {
  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="w-full max-w-[500px] bg-card rounded-lg border border-border shadow-sm overflow-hidden h-[600px] max-h-[680px] flex flex-col relative z-10">
        <ChatWidget />
      </div>
    </div>
  );
}
