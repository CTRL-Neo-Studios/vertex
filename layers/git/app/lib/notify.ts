/** Toasts as the app's own look: an error, a note, a success. */
export function useNotify() {
    const toast = useToast()
    const add = (color: 'error' | 'info' | 'success', icon: string) => (title: string, description?: string) =>
        toast.add({title, description, color, icon})
    return {
        error: add('error', 'i-lucide-circle-alert'),
        info: add('info', 'i-lucide-info'),
        success: add('success', 'i-lucide-circle-check'),
    }
}
