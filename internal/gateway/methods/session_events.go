package methods

import (
	"github.com/google/uuid"

	"github.com/nextlevelbuilder/goclaw/internal/bus"
	"github.com/nextlevelbuilder/goclaw/pkg/protocol"
)

// broadcastSessionUpdated fans out a session.updated event for a label change.
//
// ownerUserID must be the session's owner, not the acting client: the event is
// narrowed per-user by the payload's userId in gateway.clientCanReceiveEvent,
// so passing an actor id routes the update away from the owner's clients.
func broadcastSessionUpdated(pub bus.EventPublisher, tenantID uuid.UUID, sessionKey, label, ownerUserID string) {
	bus.BroadcastForTenant(pub, protocol.EventSessionUpdated, tenantID, map[string]string{
		"sessionKey": sessionKey,
		"label":      label,
		"userId":     ownerUserID,
	})
}
