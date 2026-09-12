import { useEffect, useRef, useState } from "react";
import { CheckCircle2, GraduationCap, MessageCircle, ShieldCheck, X } from "lucide-react";
import { ChatWidget } from "@/components/chat-widget";

export default function Home() {
  const pageRef = useRef<HTMLDivElement>(null);
  const [isOpen, setIsOpen] = useState(true);
  useEffect(() => {
    const viewport = window.visualViewport;
    const resize = () => pageRef.current?.style.setProperty("--chat-viewport-height", `${viewport?.height ?? window.innerHeight}px`);
    resize();
    viewport?.addEventListener("resize", resize);
    window.addEventListener("resize", resize);
    return () => { viewport?.removeEventListener("resize", resize); window.removeEventListener("resize", resize); };
  }, []);
  useEffect(() => {
    if (!isOpen) return;
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === "Escape") setIsOpen(false); };
    document.addEventListener("keydown", closeOnEscape);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.removeEventListener("keydown", closeOnEscape); document.body.style.overflow = previousOverflow; };
  }, [isOpen]);
  return (
    <div ref={pageRef} className="consultation-stage">
      <div className="consultation-stage__brand" aria-hidden="true">
        <div className="consultation-stage__mark">ИНОБР</div>
        <div className="consultation-stage__lines"><span /><span /><span /></div>
      </div>
      <button className="consultation-stage__trigger" onClick={() => setIsOpen(true)}>
        Получить консультацию
      </button>

      {isOpen && (
        <div className="consultation-overlay" role="presentation" onMouseDown={(event) => {
          if (event.target === event.currentTarget) setIsOpen(false);
        }}>
          <section className="consultation-modal" role="dialog" aria-modal="true" aria-labelledby="consultation-title">
            <button className="consultation-modal__close" onClick={() => setIsOpen(false)} aria-label="Закрыть консультацию">
              <X aria-hidden="true" />
            </button>

            <div className="consultation-modal__workspace">
              <ChatWidget />
            </div>

            <aside className="consultation-info" aria-label="О консультации">
              <div className="consultation-info__heading">
                <span className="consultation-info__icon"><GraduationCap aria-hidden="true" /></span>
                <div>
                  <p className="consultation-info__eyebrow">По итогам 4 вопросов</p>
                  <h2>Персональная рекомендация</h2>
                </div>
              </div>

              <ul className="consultation-info__benefits">
                <li><CheckCircle2 aria-hidden="true" /><span>Подберём направление по вашим целям</span></li>
                <li><MessageCircle aria-hidden="true" /><span>Ответим на вопросы о программе</span></li>
                <li><ShieldCheck aria-hidden="true" /><span>Объясним следующий шаг без давления</span></li>
              </ul>

              <div className="consultation-info__person">
                <div className="consultation-info__portrait">
                  <img src="/artem-consultant.png" alt="Артём, персональный консультант ИНОБР" />
                </div>
                <div className="consultation-info__person-copy">
                  <strong>Артём</strong>
                  <span>Ваш персональный консультант</span>
                  <p>Поможет разобраться в направлении и ответит на вопросы.</p>
                </div>
              </div>

              <div className="consultation-info__hint">
                <span />
                <p>Начните с короткой диагностики — рекомендация появится прямо в диалоге.</p>
              </div>
            </aside>
          </section>
        </div>
      )}
    </div>
  );
}
