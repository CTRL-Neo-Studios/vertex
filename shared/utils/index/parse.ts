import type {YamlFormData} from "@type32/yaml-editor-form";
import {getFileExtensionFromPath, isPlainTextFile, isYamlFile} from "#shared/utils/fs/filenames";

/** Parsers injected by the caller (the editor package's auto-imported utils in the app; stubs in tests). */
export interface ContentParsers {
    parseYaml: (text: string) => { data?: unknown, error?: unknown }
    parseFrontmatter: (text: string) => { data?: unknown, error?: unknown }
    getInternalLinks: (text: string) => { path: string }[]
}

export const PROPERTIES_FILE_NAMES = ['properties.yml', 'properties.yaml'] as const

export function isPropertiesFile(fileName: string) {
    return (PROPERTIES_FILE_NAMES as readonly string[]).includes(fileName)
}

export function parentPathOf(path: string) {
    return path.slice(0, path.lastIndexOf('/'))
}

/**
 * Properties of a file: YAML body for .yml/.yaml, frontmatter for md/txt, nothing otherwise.
 * Parse errors are reported via `error` instead of silently becoming `{}`.
 */
export function parseProperties(path: string, content: string, parsers: ContentParsers): { properties: YamlFormData, error?: unknown } {
    const ext = getFileExtensionFromPath(path)
    const parse = isYamlFile(ext) ? parsers.parseYaml : isPlainTextFile(ext) ? parsers.parseFrontmatter : undefined
    if (!parse) return {properties: {}}
    try {
        const result = parse(content)
        return {properties: (result.data ?? {}) as YamlFormData, error: result.error}
    } catch (error) {
        return {properties: {}, error}
    }
}

/** Raw `[[target]]` link targets in a document (only md/txt carry links). */
export function parseLinkTargets(path: string, content: string, parsers: ContentParsers): string[] {
    if (!isPlainTextFile(getFileExtensionFromPath(path))) return []
    return parsers.getInternalLinks(content).map(l => l.path)
}
