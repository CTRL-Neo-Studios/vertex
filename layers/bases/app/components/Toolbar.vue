<script setup lang="ts">
/** The base's toolbar, as Obsidian lays it out: the views menu and results on the left; Sort … New on the right. */
</script>

<template>
    <div class="w-full flex items-center gap-0.5 px-2 py-1">
        <BasesViewsMenu/>
        <BasesResultsMenu/>
        <div class="grow"/>
        <BasesSortMenu/>
        <BasesGroupMenu/>
        <BasesFilterMenu/>
        <BasesPropertiesMenu/>
        <BasesSearch/>
        <BasesNewItem/>
    </div>
</template>
