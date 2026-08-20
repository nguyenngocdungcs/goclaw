import { memo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { MessageSquare, MoreVertical, Pencil, Trash2 } from "lucide-react";
import { Popover } from "radix-ui";
import { formatRelativeTime } from "@/lib/format";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { SessionInfo } from "@/types/session";

interface SessionSwitcherProps {
  sessions: SessionInfo[];
  activeKey: string;
  onSelect: (key: string) => void;
  onDelete?: (key: string) => void;
  onRename?: (key: string, label: string) => void;
  loading?: boolean;
}

/** Build a human-friendly label from session metadata or key */
function sessionLabel(session: SessionInfo): string {
  if (session.label) return session.label;
  if (session.metadata?.chat_title) return session.metadata.chat_title;
  if (session.metadata?.display_name) return session.metadata.display_name;

  const parts = session.key.split(":");
  const scope = parts.length >= 3 ? parts.slice(2).join(":") : session.key;

  if (scope.startsWith("ws-")) {
    const segments = scope.split("-");
    const shortId = segments[segments.length - 1] ?? scope;
    return `Chat ${shortId}`;
  }
  if (scope.startsWith("ws:direct:")) {
    const uuid = scope.replace("ws:direct:", "");
    return `Chat ${uuid.slice(0, 8)}`;
  }
  if (scope.startsWith("team:")) return `Team ${scope.replace("team:", "").slice(0, 12)}`;
  if (scope.startsWith("cron:")) return `Cron ${scope.replace("cron:", "")}`;

  return scope.length > 24 ? scope.slice(0, 21) + "…" : scope;
}

/**
 * Owns the rename draft so typing re-renders only this form — keeping the
 * draft in SessionSwitcher re-rendered every session row on each keystroke.
 */
function RenameSessionForm({
  inputRef,
  currentLabel,
  onCancel,
  onSubmit,
}: {
  inputRef: React.RefObject<HTMLInputElement | null>;
  currentLabel: string;
  onCancel: () => void;
  onSubmit: (label: string) => void;
}) {
  const { t } = useTranslation("chat");
  const { t: tc } = useTranslation("common");
  const [draft, setDraft] = useState(currentLabel);
  const trimmed = draft.trim();

  const submit = () => {
    if (trimmed) onSubmit(trimmed);
  };

  return (
    <>
      <Input
        ref={inputRef}
        className="h-10"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            submit();
          } else if (e.key === "Escape") {
            onCancel();
          }
        }}
        placeholder={t("renameChatPlaceholder")}
      />
      <DialogFooter>
        <Button variant="outline" onClick={onCancel}>{tc("cancel")}</Button>
        <Button onClick={submit} disabled={!trimmed}>{tc("save")}</Button>
      </DialogFooter>
    </>
  );
}

export const SessionSwitcher = memo(function SessionSwitcher({ sessions, activeKey, onSelect, onDelete, onRename, loading }: SessionSwitcherProps) {
  const { t } = useTranslation("chat");
  const { t: tc } = useTranslation("common");
  const [deleteTarget, setDeleteTarget] = useState<SessionInfo | null>(null);
  const [renameTarget, setRenameTarget] = useState<SessionInfo | null>(null);
  const renameInputRef = useRef<HTMLInputElement>(null);

  if (sessions.length === 0 && loading) {
    return (
      <div className="space-y-2 p-2">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="h-12 animate-pulse rounded-lg bg-muted" />
        ))}
      </div>
    );
  }

  if (sessions.length === 0) {
    return (
      <div className="px-4 py-8 text-center text-sm text-muted-foreground">
        {tc("noSessions")}
      </div>
    );
  }

  return (
    <>
      <div className="space-y-0.5 p-1.5">
        {sessions.map((session) => {
          const isActive = session.key === activeKey;
          const label = sessionLabel(session);

          return (
            <div
              key={session.key}
              className={`group relative flex items-center gap-1 rounded-lg px-2 py-1 text-sm transition-colors ${
                isActive ? "bg-accent text-accent-foreground" : "hover:bg-muted"
              }`}
            >
              <button
                type="button"
                onClick={() => onSelect(session.key)}
                className="flex min-w-0 flex-1 items-center gap-2.5 rounded-md px-1 py-1 text-left"
              >
                <MessageSquare className="h-4 w-4 shrink-0 text-muted-foreground" />
                <div className="min-w-0 flex-1">
                  <div className="truncate font-medium text-[13px]">{label}</div>
                  <div className="flex items-center gap-1.5 text-xs-plus text-muted-foreground">
                    <span>{session.messageCount} {tc("messages")}</span>
                    <span>·</span>
                    <span>{formatRelativeTime(session.updated)}</span>
                  </div>
                </div>
              </button>
              {(onRename || onDelete) && (
                <Popover.Root>
                  <Popover.Trigger asChild>
                    <button
                      type="button"
                      className="cursor-pointer shrink-0 rounded-md p-1.5 text-muted-foreground opacity-0 transition-opacity hover:bg-accent hover:text-accent-foreground group-hover:opacity-100 data-[state=open]:opacity-100 max-sm:opacity-100"
                      title={t("moreActions")}
                      aria-label={t("moreActions")}
                    >
                      <MoreVertical className="h-3.5 w-3.5" />
                    </button>
                  </Popover.Trigger>
                  <Popover.Portal>
                    <Popover.Content
                      align="end"
                      sideOffset={4}
                      className="z-50 w-44 rounded-lg border bg-popover p-1 text-popover-foreground shadow-md pointer-events-auto"
                    >
                      {onRename && (
                        <Popover.Close asChild>
                          <button
                            type="button"
                            onClick={() => {
                              // Defer a frame so the popover finishes closing before the
                              // dialog mounts — otherwise the popover's focus-return races
                              // the dialog taking focus and the input never gets selected.
                              requestAnimationFrame(() => setRenameTarget(session));
                            }}
                            className="flex w-full cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-accent"
                          >
                            <Pencil className="h-3.5 w-3.5 shrink-0" />
                            <span>{t("rename")}</span>
                          </button>
                        </Popover.Close>
                      )}
                      {onDelete && (
                        <Popover.Close asChild>
                          <button
                            type="button"
                            onClick={() => setDeleteTarget(session)}
                            className="flex w-full cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm text-destructive hover:bg-accent"
                          >
                            <Trash2 className="h-3.5 w-3.5 shrink-0" />
                            <span>{tc("delete")}</span>
                          </button>
                        </Popover.Close>
                      )}
                    </Popover.Content>
                  </Popover.Portal>
                </Popover.Root>
              )}
            </div>
          );
        })}
      </div>

      <Dialog open={!!renameTarget} onOpenChange={(open) => !open && setRenameTarget(null)}>
        <DialogContent
          onOpenAutoFocus={(e) => {
            e.preventDefault();
            const input = renameInputRef.current;
            if (!input) return;
            input.focus();
            input.select();
          }}
        >
          <DialogHeader>
            <DialogTitle>{t("renameChat")}</DialogTitle>
            <DialogDescription>{t("renameChatDescription")}</DialogDescription>
          </DialogHeader>
          {renameTarget && (
            <RenameSessionForm
              key={renameTarget.key}
              inputRef={renameInputRef}
              currentLabel={sessionLabel(renameTarget)}
              onCancel={() => setRenameTarget(null)}
              onSubmit={(next) => {
                if (next !== sessionLabel(renameTarget)) {
                  onRename?.(renameTarget.key, next);
                }
                setRenameTarget(null);
              }}
            />
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("deleteChat")}</DialogTitle>
            <DialogDescription>{t("deleteChatConfirm")}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)}>{tc("cancel")}</Button>
            <Button
              variant="destructive"
              onClick={() => {
                if (deleteTarget) {
                  onDelete?.(deleteTarget.key);
                  setDeleteTarget(null);
                }
              }}
            >
              {tc("delete")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
});
