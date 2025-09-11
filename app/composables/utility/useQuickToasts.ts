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

    function success(title: string, description?: string) {
        $t.add({
            title: title,
            description: description,
            color: 'success',
            icon: 'lucide:circle-check'
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