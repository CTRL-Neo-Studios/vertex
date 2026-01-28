import {z} from 'zod';
import { useServerEncryption } from '~~/server/utils/useServerEncryption'

const bodySchema = z.object({
    content: z.string()
})
export default defineEventHandler(async (event) => {
    const {content} = await readValidatedBody(event, bodySchema.parse)
    const $rc = useRuntimeConfig()
    const {decrypt, encrypt} = useServerEncryption()
    return decrypt(content, $rc.session.password)
})