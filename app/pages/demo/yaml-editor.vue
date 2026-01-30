<script setup lang="ts">
import type {YamlFormData} from '@type32/yaml-editor-form'

const yamlData = ref<YamlFormData>({
    title: 'Demo Document',
    author: 'John Doe',
    published: '2024-01-15',
    created_at: '2024-01-15T10:30:00',
    count: 42,
    is_active: true,
    tags: ['vue', 'nuxt', 'yaml'],
    metadata: {
        version: '1.0',
        status: 'draft',
    },
    items: [
        { name: 'Item 1', value: 100 },
        { name: 'Item 2', value: 200 },
    ],
})

// For debugging
watch(yamlData, (newVal) => {
    console.log('YAML Data Updated:', newVal)
}, { deep: true })
</script>

<template>
    <div class="min-h-screen bg-default p-8">
        <div class="max-w-4xl mx-auto space-y-6">
            <div>
                <h1 class="text-2xl font-bold mb-2">YAML Form Editor Demo</h1>
                <p class="text-muted">
                    Test the YAML editor with all field types: strings, numbers, booleans, dates, datetimes, tags, arrays, and objects.
                </p>
            </div>

            <UCard>
                <template #header>
                    <div class="flex items-center justify-between">
                        <h2 class="text-lg font-semibold">Form Data</h2>
                        <UBadge>{{ Object.keys(yamlData).length }} fields</UBadge>
                    </div>
                </template>

                <YamlFormEditor v-model="yamlData" />
            </UCard>

            <UCard>
                <template #header>
                    <h2 class="text-lg font-semibold">Raw YAML Output</h2>
                </template>

                <pre class="text-xs bg-elevated p-4 rounded-lg overflow-auto">{{ yamlData }}</pre>
            </UCard>

            <div class="space-y-2">
                <h3 class="text-sm font-semibold">Features to Test:</h3>
                <ul class="text-sm text-muted space-y-1">
                    <li>✓ <strong>Date fields</strong> - Uses UInputDate (e.g., "published")</li>
                    <li>✓ <strong>DateTime fields</strong> - Uses UInputDate + UInputTime (e.g., "created_at")</li>
                    <li>✓ <strong>String arrays</strong> - Uses UInputTags (e.g., "tags")</li>
                    <li>✓ <strong>Type conversion dropdown</strong> - Click the icon next to field names to change types</li>
                    <li>✓ <strong>Nested objects</strong> - Expandable/collapsible (e.g., "metadata")</li>
                    <li>✓ <strong>Array of objects</strong> - Each item is editable (e.g., "items")</li>
                    <li>✓ <strong>Add/Remove fields</strong> - Use the + and trash icons</li>
                    <li>✓ <strong>Rename fields</strong> - Click on field names to edit</li>
                </ul>
            </div>
        </div>
    </div>
</template>
