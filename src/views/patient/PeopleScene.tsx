import { AlertCircle, Check, MessageSquare, Pencil, Phone, Plus, Star, Trash2, X } from "lucide-react";
import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";

import { Avatar } from "../../components/ui/Avatar";
import { Button } from "../../components/ui/Button";
import { cx } from "../../lib/utils";
import { readImageAsDataUrl } from "../../lib/readImageAsDataUrl";
import type { CareContact } from "../../features/care/types";

interface PeopleSceneProps {
  contacts: ReadonlyArray<CareContact>;
  /** Save the full new list back. Backed by the same TanStack mutations
   *  the caregiver Manage scene uses — see useBackendContacts. */
  onContactsChange: (next: CareContact[]) => void;
}

type FormMode = { kind: "closed" } | { kind: "add" } | { kind: "edit"; id: string };

function emptyContact(): CareContact {
  return {
    id: `c-${Date.now()}`,
    name: "",
    relationship: "",
    phone: "",
    isEmergency: false,
    photo: "",
  };
}

export function PeopleScene({ contacts, onContactsChange }: PeopleSceneProps) {
  const { t } = useTranslation();
  const [mode, setMode] = useState<FormMode>({ kind: "closed" });
  const emergency = contacts.filter((c) => c.isEmergency);
  const family = contacts.filter((c) => !c.isEmergency);

  function startAdd() {
    setMode({ kind: "add" });
  }
  function startEdit(id: string) {
    setMode({ kind: "edit", id });
  }
  function closeForm() {
    setMode({ kind: "closed" });
  }
  function commit(next: CareContact) {
    if (mode.kind === "add") {
      onContactsChange([...contacts, next]);
    } else if (mode.kind === "edit") {
      onContactsChange(contacts.map((c) => (c.id === mode.id ? next : c)));
    }
    closeForm();
  }
  function removeContact(id: string) {
    if (!window.confirm(t("people.removeConfirm"))) return;
    onContactsChange(contacts.filter((c) => c.id !== id));
    if (mode.kind === "edit" && mode.id === id) closeForm();
  }

  const editingContact =
    mode.kind === "edit" ? contacts.find((c) => c.id === mode.id) ?? null : null;

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl font-semibold leading-tight text-slate-900 sm:text-4xl">
            {t("people.title")}
          </h1>
          <p className="mt-2 max-w-md text-sm leading-6 text-slate-600 sm:text-base">
            {t("people.subtitle")}
          </p>
        </div>
        {mode.kind === "closed" ? (
          <Button size="sm" icon={<Plus size={14} />} onClick={startAdd}>
            {t("people.addPerson")}
          </Button>
        ) : null}
      </header>

      {mode.kind === "add" ? (
        <ContactForm initial={emptyContact()} onCancel={closeForm} onSave={commit} />
      ) : null}

      {emergency.length > 0 ? (
        <section className="rounded-3xl border border-red-200 bg-gradient-to-br from-red-50 to-rose-50 p-5">
          <div className="flex items-center gap-2 text-red-700">
            <AlertCircle size={16} aria-hidden />
            <span className="text-xs font-semibold uppercase tracking-wider">
              {t("people.inEmergency")}
            </span>
          </div>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            {emergency.map((contact) =>
              editingContact?.id === contact.id ? (
                <ContactForm
                  key={contact.id}
                  initial={editingContact}
                  onCancel={closeForm}
                  onSave={commit}
                  onDelete={() => removeContact(contact.id)}
                />
              ) : (
                <ContactCard
                  key={contact.id}
                  contact={contact}
                  prominent
                  onEdit={() => startEdit(contact.id)}
                />
              ),
            )}
          </div>
        </section>
      ) : null}

      {family.length > 0 ? (
        <section className="space-y-3">
          <h2 className="px-1 text-sm font-semibold uppercase tracking-wider text-slate-500">
            {t("people.familyTeam")}
          </h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {family.map((contact) =>
              editingContact?.id === contact.id ? (
                <ContactForm
                  key={contact.id}
                  initial={editingContact}
                  onCancel={closeForm}
                  onSave={commit}
                  onDelete={() => removeContact(contact.id)}
                />
              ) : (
                <ContactCard
                  key={contact.id}
                  contact={contact}
                  onEdit={() => startEdit(contact.id)}
                />
              ),
            )}
          </div>
        </section>
      ) : null}

      {contacts.length === 0 && mode.kind === "closed" ? (
        <div className="flex flex-col items-center gap-4 rounded-3xl border border-dashed border-slate-200 bg-slate-50 px-6 py-12 text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-white text-cyan-600 shadow-sm">
            <Plus size={22} aria-hidden />
          </div>
          <div>
            <h3 className="text-base font-semibold text-slate-900">{t("people.emptyHeading")}</h3>
            <p className="mt-1 max-w-sm text-sm text-slate-600">{t("people.emptyBody")}</p>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function ContactCard({
  contact,
  prominent = false,
  onEdit,
}: {
  contact: CareContact;
  prominent?: boolean;
  onEdit: () => void;
}) {
  const { t } = useTranslation();
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
          name={contact.name || "?"}
          src={contact.photo || undefined}
          size="lg"
          hue={prominent ? "rose" : undefined}
        />
        <div className="min-w-0 flex-1">
          <h3 className="text-base font-semibold text-slate-900">
            {contact.name || t("common.unknown")}
          </h3>
          <p className="text-xs text-slate-500">{contact.relationship || t("common.unknown")}</p>
          {contact.phone ? (
            <p className="mt-1 truncate font-mono text-sm text-slate-700">{contact.phone}</p>
          ) : null}
        </div>
        <button
          type="button"
          onClick={onEdit}
          aria-label={`Edit ${contact.name || "contact"}`}
          className="rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
        >
          <Pencil size={14} aria-hidden />
        </button>
      </div>
      <div className="mt-4 flex gap-2">
        {contact.phone ? (
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
            {t("common.call")}
          </a>
        ) : null}
        {!prominent && contact.phone ? (
          <a
            href={`sms:${sanitizedPhone}`}
            className="flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
            aria-label={`Message ${contact.name}`}
          >
            <MessageSquare size={14} aria-hidden />
            {t("common.message")}
          </a>
        ) : null}
      </div>
    </article>
  );
}

function ContactForm({
  initial,
  onCancel,
  onSave,
  onDelete,
}: {
  initial: CareContact;
  onCancel: () => void;
  onSave: (next: CareContact) => void;
  onDelete?: () => void;
}) {
  const { t } = useTranslation();
  const [draft, setDraft] = useState<CareContact>(initial);
  const photoInputRef = useRef<HTMLInputElement | null>(null);

  function set<K extends keyof CareContact>(key: K, value: CareContact[K]) {
    setDraft((prev) => ({ ...prev, [key]: value }));
  }
  function handlePhoto(file: File | undefined) {
    if (!file) return;
    void readImageAsDataUrl(file).then((dataUrl) => set("photo", dataUrl));
  }

  return (
    <article className="rounded-2xl border border-cyan-200 bg-white p-4 shadow-(--shadow-soft)">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          onSave(draft);
        }}
        className="space-y-3"
      >
        <div className="flex items-start gap-3">
          <Avatar
            name={draft.name || "?"}
            src={draft.photo || undefined}
            size="lg"
            hue={draft.isEmergency ? "rose" : undefined}
          />
          <div className="flex-1 grid gap-2">
            <input
              type="text"
              placeholder={t("people.name")}
              value={draft.name}
              onChange={(e) => set("name", e.target.value)}
              autoFocus
              required
              className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-cyan-500 focus:outline-none focus:ring-2 focus:ring-cyan-100"
            />
            <input
              type="text"
              placeholder={t("people.relationship")}
              value={draft.relationship}
              onChange={(e) => set("relationship", e.target.value)}
              className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-cyan-500 focus:outline-none focus:ring-2 focus:ring-cyan-100"
            />
            <input
              type="tel"
              inputMode="tel"
              placeholder={t("people.phone")}
              value={draft.phone}
              onChange={(e) => set("phone", e.target.value)}
              className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-cyan-500 focus:outline-none focus:ring-2 focus:ring-cyan-100"
            />
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <input
            ref={photoInputRef}
            type="file"
            accept="image/*"
            onChange={(e) => handlePhoto(e.target.files?.[0])}
            className="hidden"
          />
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={() => photoInputRef.current?.click()}
          >
            {draft.photo ? t("profile.changePhoto") : t("profile.uploadPhoto")}
          </Button>
          {draft.photo ? (
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => set("photo", "")}
            >
              {t("profile.removePhoto")}
            </Button>
          ) : null}
          <button
            type="button"
            onClick={() => set("isEmergency", !draft.isEmergency)}
            className={cx(
              "inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold transition",
              draft.isEmergency
                ? "border-red-200 bg-red-50 text-red-700"
                : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50",
            )}
          >
            <Star size={12} aria-hidden />
            {draft.isEmergency ? t("people.isEmergency") : t("people.markEmergency")}
          </button>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
          {onDelete ? (
            <button
              type="button"
              onClick={onDelete}
              className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-xs font-semibold text-red-600 transition hover:bg-red-50"
            >
              <Trash2 size={13} aria-hidden />
              {t("common.remove")}
            </button>
          ) : (
            <span />
          )}
          <div className="flex gap-2">
            <Button
              type="button"
              variant="secondary"
              size="sm"
              icon={<X size={14} />}
              onClick={onCancel}
            >
              {t("common.cancel")}
            </Button>
            <Button type="submit" size="sm" icon={<Check size={14} />}>
              {t("common.save")}
            </Button>
          </div>
        </div>
      </form>
    </article>
  );
}
