import {ref} from 'vue'

/** Whether the palette is open; one per window (a session window shows one session), set by Search and ⌘P. */
export const open = ref(false)
