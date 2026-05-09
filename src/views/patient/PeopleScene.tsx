import { AlertCircle, MessageSquare, Phone } from "lucide-react";

import { Avatar } from "../../components/ui/Avatar";
import { cx } from "../../lib/utils";
import type { CareContact } from "../../features/care/types";

interface PeopleSceneProps {
  contacts: ReadonlyArray<CareContact>;
}

export function PeopleScene({ contacts }: PeopleSceneProps) {
  const emergency = contacts.filter((c) => c.isEmergency);
  const family = contacts.filter((c) => !c.isEmergency);

  return (
    <div className="space-y-6">
      <header>
        <h1 className="font-display text-3xl font-semibold leading-tight text-slate-900 sm:text-4xl">
          People
        </h1>
        <p className="mt-2 max-w-md text-sm leading-6 text-slate-600 sm:text-base">
          Your family, doctor, and emergency line — all one tap away.
        </p>
      </header>

      {emergency.length > 0 ? (
        <section className="rounded-3xl border border-red-200 bg-gradient-to-br from-red-50 to-rose-50 p-5">
          <div className="flex items-center gap-2 text-red-700">
            <AlertCircle size={16} aria-hidden />
            <span className="text-[11px] font-semibold uppercase tracking-wider">
              In an emergency
            </span>
          </div>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            {emergency.map((contact) => (
              <ContactCard key={contact.id} contact={contact} prominent />
            ))}
          </div>
        </section>
      ) : null}

      {family.length > 0 ? (
        <section className="space-y-3">
          <h2 className="px-1 text-sm font-semibold uppercase tracking-wider text-slate-500">
            Family &amp; care team
          </h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {family.map((contact) => (
              <ContactCard key={contact.id} contact={contact} />
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}

function ContactCard({
  contact,
  prominent = false,
}: {
  contact: CareContact;
  prominent?: boolean;
}) {
  const sanitizedPhone = contact.phone.replace(/\s+/g, "");
  return (
    <article
      className={cx(
        "group relative overflow-hidden rounded-2xl border p-4 shadow-(--shadow-soft) transition",
        prominent
          ? "border-red-200 bg-white"
          : "border-slate-200 bg-white hover:-translate-y-0.5 hover:shadow-(--shadow-card)",
      )}
    >
      <div className="flex items-start gap-4">
        <Avatar
          name={contact.name}
          src={contact.photo || undefined}
          size="lg"
          hue={prominent ? "rose" : undefined}
        />
        <div className="min-w-0 flex-1">
          <h3 className="text-base font-semibold text-slate-900">{contact.name}</h3>
          <p className="text-xs text-slate-500">{contact.relationship}</p>
          <p className="mt-1 truncate font-mono text-sm text-slate-700">{contact.phone}</p>
        </div>
      </div>
      <div className="mt-4 flex gap-2">
        <a
          href={`tel:${sanitizedPhone}`}
          className={cx(
            "flex flex-1 items-center justify-center gap-2 rounded-xl px-3 py-2.5 text-sm font-semibold transition",
            prominent
              ? "bg-red-600 text-white hover:bg-red-500"
              : "bg-slate-900 text-white hover:bg-slate-800",
          )}
        >
          <Phone size={14} aria-hidden />
          Call
        </a>
        {!prominent ? (
          <a
            href={`sms:${sanitizedPhone}`}
            className="flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
            aria-label={`Message ${contact.name}`}
          >
            <MessageSquare size={14} aria-hidden />
            Message
          </a>
        ) : null}
      </div>
    </article>
  );
}
