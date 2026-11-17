/** Toasts as the app's own look: an error, a warning, a success. */
export function useNotify() {
    const toast = useToast()
    const add = (color: 'error' | 'warning' | 'success', icon: string) => (title: string, description?: string) =>
        toast.add({title, description, color, icon})
    return {
        error: add('error', 'i-lucide-circle-alert'),
        warning: add('warning', 'i-lucide-triangle-alert'),
        success: add('success', 'i-lucide-circle-check'),
    }
}
