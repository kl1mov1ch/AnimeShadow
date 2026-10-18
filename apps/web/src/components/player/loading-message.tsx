import { useEffect, useState } from "react";

const WAITING = [
  "Собираем чакру для следующего кадра…",
  "Герой ещё завязывает повязку. Скоро начинаем!",
  "Ищем портал с самым быстрым интернетом…",
  "Эта загрузка тренируется стать короче…",
  "Сэнпай договаривается с сервером…",
  "Поток проходит короткую тренировочную арку…",
];
const FAILED = [
  "Сервер ушёл на тренировочную арку",
  "Портал в эту серию пока закрыт",
  "У потока незапланированная филлерная серия",
  "Сэнпай, нам нужен другой источник",
  "Чакра потока закончилась — попробуем снова?",
];
export function LoadingMessage({ failed = false }: { failed?: boolean }) {
  const [index, setIndex] = useState(() => Math.floor(Math.random() * 30));
  useEffect(() => {
    if (failed) return;
    const timer = setInterval(() => { if (!document.hidden) setIndex((value) => value + 1); }, 10000);
    return () => clearInterval(timer);
  }, [failed]);
  const phrases = failed ? FAILED : WAITING;
  return <span className="block max-w-full text-center text-xs font-medium leading-relaxed [overflow-wrap:anywhere] sm:text-sm">{phrases[index % phrases.length]}</span>;
}
