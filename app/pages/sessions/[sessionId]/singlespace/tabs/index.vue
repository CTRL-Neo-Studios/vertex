<script setup lang="ts">
definePageMeta({
    layout: 'session'
})
const {t} = useI18n()
</script>

<template>
    <div class="w-full h-full flex flex-col items-center justify-center">
        <div class="text-muted">{{ t('app.editor.ui.selectFile') }}</div>
    </div>
</template>
