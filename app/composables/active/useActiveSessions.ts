import type {ActiveSession} from "#shared/types/active/sessions";
import type {PossiblyRef} from "#shared/types/types";

export function useActiveSessions() {
    const sessions = useState<ActiveSession[]>('active.sessions', () => []);

    function addSession(sesh: ActiveSession) {
        sessions.value.push(sesh)
        return sesh
    }

    function removeSession(sessionId: PossiblyRef<string>) {
        sessions.value = sessions.value.filter(i => i.uuid != unref(sessionId))
    }

    function getSession(sessionId: PossiblyRef<string>): ActiveSession | undefined {
        return sessions.value.find(i => i.uuid == unref(sessionId));
    }

    function hasSessionWithId(sessionId: PossiblyRef<string>) {
        return sessions.value.findIndex(i => i.uuid == unref(sessionId)) != -1;
    }

    function hasSessionWithPath(fullFilePath: PossiblyRef<string>) {
        return sessions.value.findIndex(i => i.rootPath == unref(fullFilePath)) != -1
    }

    return {
        sessions,
        addSession,
        removeSession,
        getSession,
        hasSessionWithId,
        hasSessionWithPath
    }
}