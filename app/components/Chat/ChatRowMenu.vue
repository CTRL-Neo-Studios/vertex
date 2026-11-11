<script setup lang="ts">
import type {DropdownMenuItem} from "@nuxt/ui";

/**
 * A Chats list row's "…" menu. Its items are built when it opens, and opening it re-renders only this menu: with the
 * open state in the list, every row of a list of thousands redrew.
 */
const props = defineProps<{ items: () => DropdownMenuItem[][] }>()
const open = ref(false)
const NONE: DropdownMenuItem[][] = []
const shown = computed(() => (open.value ? props.items() : NONE))
const CONTENT = {align: 'end' as const}
</script>

<template>
    <UDropdownMenu v-model:open="open" :items="shown" :content="CONTENT" size="sm">
        <UButton
            as="div"
            icon="i-lucide-ellipsis"
            color="neutral"
            variant="link"
            size="sm"
            class="rounded-[5px] hover:bg-accented/50 focus-visible:bg-accented/50 data-[state=open]:bg-accented/50"
            :aria-label="$t('app.chat.actions')"
            tabindex="-1"
            @click.stop.prevent
        />
    </UDropdownMenu>
</template>
