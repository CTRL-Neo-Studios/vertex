import { cbc } from '@noble/ciphers/aes.js'
import { bytesToHex, hexToBytes, randomBytes } from '@noble/ciphers/utils.js'

export function useServerEncryption() {
    function getKeyBytes(key: string): Uint8Array {
        const paddedKey = key.padEnd(32).slice(0, 32)
        return new TextEncoder().encode(paddedKey)
    }

    function encrypt(text: string, key: string): string {
        const iv = randomBytes(16)
        const keyBytes = getKeyBytes(key)
        const cipher = cbc(keyBytes, iv)

        const textBytes = new TextEncoder().encode(text)
        const encrypted = cipher.encrypt(textBytes)

        return `${bytesToHex(iv)}:${bytesToHex(encrypted)}`
    }

    function decrypt(text: string, key: string): string {
        const parts = text.split(':')
        if (parts.length !== 2) {
            throw new Error('Invalid ciphertext format')
        }

        const [ivHex, encryptedHex] = parts

        if (!ivHex || !encryptedHex)
            throw new Error('Invalid ciphertext format')

        const iv = hexToBytes(ivHex)
        const encrypted = hexToBytes(encryptedHex)
        const keyBytes = getKeyBytes(key)

        const decipher = cbc(keyBytes, iv)
        const decrypted = decipher.decrypt(encrypted)

        return new TextDecoder().decode(decrypted)
    }

    async function encryptEndpoint(text: string): Promise<string> {
        return await $fetch('/api/v1/auth/encrypt', {
            method: 'post',
            body: {
                content: text
            }
        })
    }

    async function decryptEndpoint(text: string): Promise<string> {
        return await $fetch('/api/v1/auth/decrypt', {
            method: 'post',
            body: {
                content: text
            }
        })
    }

    return {
        encrypt,
        decrypt,
        encryptEndpoint,
        decryptEndpoint
    }
}