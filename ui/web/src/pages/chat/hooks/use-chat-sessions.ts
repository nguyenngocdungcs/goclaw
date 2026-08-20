import { useState, useEffect, useCallback } from "react";
import { useWs } from "@/hooks/use-ws";
import { useWsEvent } from "@/hooks/use-ws-event";
import { Methods, Events } from "@/api/protocol";
import type { SessionInfo } from "@/types/session";
import { useAuthStore } from "@/stores/use-auth-store";
import { toast } from "@/stores/use-toast-store";
import i18next from "i18next";
import { userFriendlyError } from "@/lib/error-utils";
import { uniqueId } from "@/lib/utils";

/**
 * Manages the session list for the chat sidebar.
 * Loads sessions for the selected agent, supports creating new sessions.
 */
export function useChatSessions(agentId: string) {
  const ws = useWs();
  const connected = useAuthStore((s) => s.connected);
  const [sessions, setSessions] = useState<SessionInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadSessions = useCallback(async () => {
    if (!connected) return;
    setLoading(true);
    setError(null);
    try {
      const res = await ws.call<{ sessions: SessionInfo[] }>(
        Methods.SESSIONS_LIST,
        { agentId, channel: "ws" },
      );
      const sorted = (res.sessions ?? []).sort(
        (a: SessionInfo, b: SessionInfo) =>
          new Date(b.updated).getTime() - new Date(a.updated).getTime(),
      );
      setSessions(sorted);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load sessions");
    } finally {
      setLoading(false);
    }
  }, [ws, agentId, connected]);

  useEffect(() => {
    loadSessions();
  }, [loadSessions]);

  const buildNewSessionKey = useCallback(() => {
    const convId = uniqueId();
    return `agent:${agentId}:ws:direct:${convId}`;
  }, [agentId]);

  const deleteSession = useCallback(async (key: string) => {
    if (!connected) return;
    try {
      await ws.call(Methods.SESSIONS_DELETE, { key });
      await loadSessions();
      toast.success(i18next.t("sessions:toast.deleted"));
    } catch (err) {
      toast.error(i18next.t("sessions:toast.deleteFailed"), userFriendlyError(err));
      throw err;
    }
  }, [ws, connected, loadSessions]);

  const renameSession = useCallback(async (key: string, label: string) => {
    if (!connected) return;
    const trimmed = label.trim();
    if (!trimmed) return;
    try {
      await ws.call(Methods.SESSIONS_PATCH, { key, label: trimmed });
      setSessions((prev) =>
        prev.map((s) => (s.key === key ? { ...s, label: trimmed } : s)),
      );
      toast.success(i18next.t("sessions:toast.updated"));
    } catch (err) {
      toast.error(i18next.t("sessions:toast.updateFailed"), userFriendlyError(err));
      throw err;
    }
  }, [ws, connected]);

  // Update session label in-place when backend generates a title, or when
  // another client renames the session. Returns `prev` untouched when nothing
  // changes so React can skip the re-render — this event also echoes back to
  // the client that made the rename, and reaches every admin tab in the tenant.
  const handleSessionUpdated = useCallback((payload: unknown) => {
    const event = payload as { sessionKey?: string; label?: string };
    if (!event?.sessionKey || !event?.label) return;
    setSessions((prev) => {
      const i = prev.findIndex((s) => s.key === event.sessionKey);
      const current = i === -1 ? undefined : prev[i];
      if (!current || current.label === event.label) return prev;
      const next = prev.slice();
      next[i] = { ...current, label: event.label };
      return next;
    });
  }, []);
  useWsEvent(Events.SESSION_UPDATED, handleSessionUpdated);

  return {
    sessions,
    loading,
    error,
    refresh: loadSessions,
    buildNewSessionKey,
    deleteSession,
    renameSession,
  };
}
