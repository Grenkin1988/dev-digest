/* ConfirmDialog — accessible replacement for window.confirm, on top of the
   UI kit's Modal: focus moves into the dialog (Cancel first, the safe choice),
   Tab is trapped inside, Escape cancels, and focus returns to the trigger.
   Use through `useConfirm()` so callers can `await confirm({...})`. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Button, Modal } from "@devdigest/ui";
import { s } from "./styles";

export interface ConfirmOptions {
  title: string;
  body?: string;
  /** Label of the confirming button (defaults to common "Delete"). */
  confirmLabel?: string;
}

interface ConfirmDialogProps extends ConfirmOptions {
  onResolve: (ok: boolean) => void;
}

const FOCUSABLE = 'button:not([disabled]), [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';

export function ConfirmDialog({ title, body, confirmLabel, onResolve }: ConfirmDialogProps) {
  const t = useTranslations("common");
  const ref = React.useRef<HTMLDivElement>(null);
  const cancelRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    cancelRef.current?.querySelector<HTMLElement>("button")?.focus();
    return () => previous?.focus?.();
  }, []);

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      e.stopPropagation();
      onResolve(false);
      return;
    }
    if (e.key !== "Tab" || !ref.current) return;
    const items = [...ref.current.querySelectorAll<HTMLElement>(FOCUSABLE)];
    if (items.length === 0) return;
    const first = items[0]!;
    const last = items[items.length - 1]!;
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  };

  return (
    <div ref={ref} onKeyDown={onKeyDown} onClick={(e) => e.stopPropagation()}>
      <Modal
        width={440}
        title={title}
        onClose={() => onResolve(false)}
        footer={
          <div style={s.footer}>
            <div ref={cancelRef}>
              <Button kind="ghost" onClick={() => onResolve(false)}>
                {t("actions.cancel")}
              </Button>
            </div>
            <Button kind="danger" onClick={() => onResolve(true)}>
              {confirmLabel ?? t("actions.delete")}
            </Button>
          </div>
        }
      >
        {body && <p style={s.body}>{body}</p>}
      </Modal>
    </div>
  );
}

/**
 * `const { confirm, dialog } = useConfirm()` → render `{dialog}` once, then
 * `if (await confirm({ title })) …`. One pending confirmation at a time.
 */
export function useConfirm() {
  const [pending, setPending] = React.useState<
    (ConfirmOptions & { resolve: (ok: boolean) => void }) | null
  >(null);

  const confirm = React.useCallback(
    (opts: ConfirmOptions) => new Promise<boolean>((resolve) => setPending({ ...opts, resolve })),
    [],
  );

  const dialog = pending ? (
    <ConfirmDialog
      title={pending.title}
      body={pending.body}
      confirmLabel={pending.confirmLabel}
      onResolve={(ok) => {
        pending.resolve(ok);
        setPending(null);
      }}
    />
  ) : null;

  return { confirm, dialog };
}
