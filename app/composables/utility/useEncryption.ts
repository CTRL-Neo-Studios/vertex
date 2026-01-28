export function useEncryption() {
    async function encryptEndpoint(text: string): Promise<string> {
        if (!text) return ""
        return await $fetch('/api/v1/auth/encrypt', {
            method: 'post',
            body: {
                apiKey: text
            }
        })
    }

    async function decryptEndpoint(text: string): Promise<string> {
        if (!text) return ""
        return await $fetch('/api/v1/auth/decrypt', {
            method: 'post',
            body: {
                encryptedKey: text
            }
        })
    }

    return {
        encryptEndpoint,
        decryptEndpoint
    }
}