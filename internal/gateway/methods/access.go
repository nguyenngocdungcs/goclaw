package methods

import (
	"context"
	"slices"

	"github.com/nextlevelbuilder/goclaw/internal/config"
	"github.com/nextlevelbuilder/goclaw/internal/gateway"
	"github.com/nextlevelbuilder/goclaw/internal/i18n"
	"github.com/nextlevelbuilder/goclaw/internal/permissions"
	"github.com/nextlevelbuilder/goclaw/internal/store"
	"github.com/nextlevelbuilder/goclaw/pkg/protocol"
)

// canSeeAll checks if user has full data visibility (admin role OR owner user).
func canSeeAll(role permissions.Role, ownerIDs []string, userID string) bool {
	if permissions.HasMinRole(role, permissions.RoleAdmin) {
		return true
	}
	if userID != "" && slices.Contains(ownerIDs, userID) {
		return true
	}
	return false
}

// loadAuthorizedSession loads a session and verifies the caller may act on it.
//
// Unlike requireSessionOwner it always resolves the session, so callers that
// need the loaded record — or that rely on the store's cache being primed
// before a mutating setter — can use it for privileged callers too. It sends
// the error response itself; a nil return means the handler must stop.
func (m *SessionsMethods) loadAuthorizedSession(ctx context.Context, client *gateway.Client, reqID, key string) *store.SessionData {
	locale := store.LocaleFromContext(ctx)
	sess := m.sessions.Get(ctx, key)
	if sess == nil {
		client.SendResponse(protocol.NewErrorResponse(reqID, protocol.ErrNotFound, i18n.T(locale, i18n.MsgNotFound, "session", key)))
		return nil
	}
	if !canSeeAll(client.Role(), m.cfg.Gateway.OwnerIDs, client.UserID()) && sess.UserID != client.UserID() {
		client.SendResponse(protocol.NewErrorResponse(reqID, protocol.ErrUnauthorized, i18n.T(locale, i18n.MsgPermissionDenied, "session")))
		return nil
	}
	return sess
}

// requireSessionOwner verifies the caller owns the session identified by key.
// Returns true if the caller is authorized (owner, admin, or matching user).
// On failure, sends an error response and returns false.
func requireSessionOwner(ctx context.Context, sessions store.SessionStore, cfg *config.Config, client *gateway.Client, reqID string, key string) bool {
	if canSeeAll(client.Role(), cfg.Gateway.OwnerIDs, client.UserID()) {
		return true
	}
	locale := store.LocaleFromContext(ctx)
	sess := sessions.Get(ctx, key)
	if sess == nil {
		client.SendResponse(protocol.NewErrorResponse(reqID, protocol.ErrNotFound, i18n.T(locale, i18n.MsgNotFound, "session", key)))
		return false
	}
	if sess.UserID != client.UserID() {
		client.SendResponse(protocol.NewErrorResponse(reqID, protocol.ErrUnauthorized, i18n.T(locale, i18n.MsgPermissionDenied, "session")))
		return false
	}
	return true
}
