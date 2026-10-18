import { useState } from "react";
import { ArrowUpRightIcon, ExpandIcon, SendIcon } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import members from "./honkon-team.json";
import { cn } from "@/lib/utils";
import { HonkonGlyph } from "@/components/brand/honkon-glyph";

const groups = [
  { name: "Глава проекта", description: "Лисья мать" },
  { name: "Дабберы", description: "Лисята, дающие голоса персонажам" },
  { name: "Сабберы", description: "Перевод и субтитры" },
  { name: "Звукорежиссёры", description: "Отвечают за весь звук" },
];
type Member = (typeof members)[number];

export function StudioTeam() {
  const [selected, setSelected] = useState<Member | null>(null);
  return (
    <section className="hk-team" id="hk-team" aria-labelledby="hk-team-title">
      <div className="hk-section-heading">
        <div>
          <p className="hk-eyebrow">Те, кто за микрофоном</p>
          <h2 id="hk-team-title" className="hk-branded-heading">
            <HonkonGlyph aria-hidden />
            Команда
          </h2>
        </div>
        <p className="hk-section-lead">
          Наша нора энтузиастов. Голоса, перевод и звук — всё начинается с людей.
        </p>
      </div>
      {groups.map((group) => (
        <div
          className={cn(
            "hk-team-row",
            group.name === "Глава проекта" && "hk-team-lead",
          )}
          key={group.name}
        >
          <div className="hk-team-role">
            <h3>{group.name}</h3>
            <p>{group.description}</p>
          </div>
          <div className="hk-people-grid">
            {members
              .filter((member) => member.role === group.name)
              .map((member) => (
                <article className="hk-person" key={`${member.role}:${member.name}`}>
                  <div className="hk-person-art">
                    <button
                      type="button"
                      className="hk-person-photo"
                      onClick={() => setSelected(member)}
                      aria-label={`Открыть фото: ${member.name}`}
                    >
                      <img
                        src={member.image}
                        alt={`Изображение профиля ${member.name}`}
                        width="480"
                        height="640"
                        loading="lazy"
                        decoding="async"
                      />
                      <span className="hk-person-gradient" />
                      <span className="hk-person-name">
                        {member.tagline && <small>{member.tagline}</small>}
                        <strong>{member.name}</strong>
                      </span>
                      <ExpandIcon className="hk-expand-photo" aria-hidden />
                    </button>
                    <div className="hk-person-socials">
                      {member.links.map((link) => (
                        <a
                          key={link.url}
                          href={link.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          aria-label={`${link.label}: ${member.name}`}
                          title={`${link.label}: ${member.name}`}
                        >
                          {link.label === "Telegram" ? (
                            <SendIcon aria-hidden />
                          ) : (
                            <ArrowUpRightIcon aria-hidden />
                          )}
                        </a>
                      ))}
                    </div>
                  </div>
                  {member.bio && <p>{member.bio}</p>}
                </article>
              ))}
          </div>
        </div>
      ))}
      <a
        className="hk-text-link"
        href="https://www.hon-kon.ru/about"
        target="_blank"
        rel="noopener noreferrer"
      >
        Команда на сайте Hon-Kon
        <ArrowUpRightIcon aria-hidden />
      </a>
      <Dialog open={!!selected} onOpenChange={(open) => !open && setSelected(null)}>
        <DialogContent className="hk-page hk-person-dialog">
          <DialogHeader>
            <DialogTitle>{selected?.name}</DialogTitle>
            <DialogDescription>{selected?.role} · Hon-Kon Studio</DialogDescription>
          </DialogHeader>
          {selected && (
            <>
              <img
                className="hk-person-full"
                src={selected.fullImage}
                alt={`Изображение профиля ${selected.name}`}
              />
              {selected.bio && <p className="hk-person-bio">{selected.bio}</p>}
              <div className="hk-person-links">
                {selected.links.map((link) => (
                  <a
                    key={link.url}
                    className="hk-text-link"
                    href={link.url}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    {link.label}
                    <ArrowUpRightIcon aria-hidden />
                  </a>
                ))}
                <a
                  className="hk-text-link"
                  href={selected.fullImage}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Открыть фотографию
                  <ArrowUpRightIcon aria-hidden />
                </a>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </section>
  );
}
