export default function () {
    const $t = useToast()

    function error(title: string, description?: string) {
        $t.add({
            title: title,
            description: description,
            color: 'error',
            icon: 'lucide:circle-alert'
        })
    }

    function info(title: string, description?: string) {
        $t.add({
            title: title,
            description: description,
            color: 'info',
            icon: 'lucide:info'
        })
    }

    function warning(title: string, description?: string) {
        $t.add({
            title: title,
            description: description,
            color: 'warning',
            icon: 'lucide:triangle-alert'
        })
    }

    /** `actions`: buttons on the toast, such as Files' Undo. */
    function success(title: string, description?: string, actions?: { label: string, onClick: () => void }[]) {
        $t.add({
            title: title,
            description: description,
            color: 'success',
            icon: 'lucide:circle-check',
            actions: actions?.map(a => ({...a, color: 'neutral', variant: 'outline', size: 'xs'})),
        })
    }

    function primary(title: string, description?: string, icon?: string) {
        $t.add({
            title: title,
            description: description,
            color: 'primary',
            icon: icon
        })
    }

    function secondary(title: string, description?: string, icon?: string) {
        $t.add({
            title: title,
            description: description,
            color: 'secondary',
            icon: icon
        })
    }

    function neutral(title: string, description?: string, icon?: string) {
        $t.add({
            title: title,
            description: description,
            color: 'neutral',
            icon: icon
        })
    }

    return {
        error,
        info,
        warning,
        success,
        primary,
        secondary,
        neutral
    }
}