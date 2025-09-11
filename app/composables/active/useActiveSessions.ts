import type {ActiveSession} from "#shared/types/active/sessions";
import type {PossiblyRef} from "#shared/types/types";

export function useActiveSessions() {
    const sessions = useState<ActiveSession[]>(() => []);

    function addSession(sesh: ActiveSession) {
        sessions.value.push(sesh)
    }

    function removeSession(sessionId: PossiblyRef<string>) {
        sessions.value = sessions.value.filter(i => i.uuid != unref(sessionId))
    }

    function getSession(sessionId: PossiblyRef<string>): ActiveSession | undefined {
        return sessions.value.find(i => i.uuid == unref(sessionId));
    }

    return {
        sessions,
        addSession,
        removeSession,
        getSession
    }
}