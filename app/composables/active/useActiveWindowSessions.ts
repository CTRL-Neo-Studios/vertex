import type {ActiveSession, ActiveWindowSession} from "#shared/types/active/sessions";
import type {PossiblyRef} from "#shared/types/types";
import useUuid from "~/composables/utility/useUuid";

export function useActiveWindowSessions() {
    const windowSessions = useState<ActiveWindowSession[]>('active.windowSessions', () => []);
    const currentSession = useState<ActiveWindowSession>('active.windowSessions.current', () => ({
        uuid: useUuid()
    }))

    function addWindowSession(sesh: ActiveWindowSession) {
        windowSessions.value.push(sesh)
        return sesh
    }

    function removeWindowSession(sessionId: PossiblyRef<string>) {
        windowSessions.value = windowSessions.value.filter(i => i.uuid != unref(sessionId))
    }

    function getWindowSession(sessionId: PossiblyRef<string>): ActiveWindowSession | undefined {
        return windowSessions.value.find(i => i.uuid == unref(sessionId));
    }

    function hasWindowSessionWithId(sessionId: PossiblyRef<string>) {
        return windowSessions.value.findIndex(i => i.uuid == unref(sessionId)) != -1;
    }

    function initialize() {
        windowSessions.value.push(unref(currentSession))
    }

    function getCurrentWindowSession() {
        return unref(currentSession)
    }

    return {
        windowSessions,
        addWindowSession,
        removeWindowSession,
        getWindowSession,
        hasWindowSessionWithId,
        initialize,
        getCurrentWindowSession
    }
}