import type {GitToken} from "#shared/types/app/git";
import GitSignInModal from "~/components/Git/GitSignInModal.vue";
import {gitClient} from "~/utils/gitClient";

/**
 * After a remote refused to sign in: asks for a personal access token for its https host (`GitSignInModal`) and
 * resolves true once one is saved, so the operation can run again. Remotes reached over ssh sign in with keys, so
 * they resolve false straight away.
 */
export function useGitSignIn() {
    const overlay = useOverlay()
    return async function signIn(urls: readonly string[]) {
        const hosts = httpsHosts(urls)
        if (!hosts.length) return false
        const saved = await gitClient.tokens().catch(() => [])
        // A new modal each time, so no token is left from the last.
        return !!await overlay.create(GitSignInModal, {destroyOnClose: true}).open({hosts, saved}).result
    }
}

/** The https hosts of `urls` (what a token is saved for), with the username a URL names. */
function httpsHosts(urls: readonly string[]): GitToken[] {
    const hosts = new Map<string, string>()
    for (const raw of urls) {
        // scp-like ssh addresses (`git@host:repo`) and folders don't parse.
        let url: URL
        try {
            url = new URL(raw)
        } catch {
            continue
        }
        if (url.protocol === 'https:' && !hosts.has(url.host)) hosts.set(url.host, decodeURIComponent(url.username))
    }
    return [...hosts].map(([host, username]) => ({host, username}))
}
