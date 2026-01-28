import type { YamlFormData } from "#shared/types/types"
import YAML from 'yaml'

/**
 * Composable for working with YAML form data
 * Provides utilities for parsing, stringifying, and validating YAML
 */
export function useYamlFormData() {
    /**
     * Parse YAML string to object
     */
    function parseYaml(yamlString: string): YamlFormData {
        try {
            return YAML.parse(yamlString) || {}
        } catch (error) {
            console.error('Failed to parse YAML:', error)
            return {}
        }
    }

    /**
     * Stringify object to YAML
     */
    function stringifyYaml(data: YamlFormData): string {
        try {
            return YAML.stringify(data, {
                indent: 2,
                lineWidth: 0, // Don't wrap lines
                minContentWidth: 0,
            })
        } catch (error) {
            console.error('Failed to stringify YAML:', error)
            return ''
        }
    }

    /**
     * Validate YAML structure
     */
    function validateYaml(yamlString: string): { valid: boolean; error?: string } {
        try {
            YAML.parse(yamlString)
            return { valid: true }
        } catch (error: any) {
            return {
                valid: false,
                error: error?.message || 'Invalid YAML'
            }
        }
    }

    /**
     * Deep clone YAML data
     */
    function cloneYaml(data: YamlFormData): YamlFormData {
        return JSON.parse(JSON.stringify(data))
    }

    /**
     * Merge YAML data (deep merge)
     */
    function mergeYaml(target: YamlFormData, source: YamlFormData): YamlFormData {
        const result = { ...target }
        
        for (const key in source) {
            const targetValue = result[key]
            const sourceValue = source[key]
            
            if (
                typeof targetValue === 'object' &&
                !Array.isArray(targetValue) &&
                targetValue !== null &&
                typeof sourceValue === 'object' &&
                !Array.isArray(sourceValue) &&
                sourceValue !== null
            ) {
                // Recursively merge objects
                result[key] = mergeYaml(targetValue as YamlFormData, sourceValue as YamlFormData)
            } else {
                // Overwrite with source value
                result[key] = sourceValue
            }
        }
        
        return result
    }

    /**
     * Get value at path (e.g., "user.name" or "items[0].title")
     */
    function getValueAtPath(data: YamlFormData, path: string): any {
        const keys = path.split(/\.|\[|\]/).filter(Boolean)
        let current: any = data
        
        for (const key of keys) {
            if (current === null || current === undefined) return undefined
            current = current[key]
        }
        
        return current
    }

    /**
     * Set value at path (e.g., "user.name" or "items[0].title")
     */
    function setValueAtPath(data: YamlFormData, path: string, value: any): YamlFormData {
        const keys = path.split(/\.|\[|\]/).filter(Boolean)
        const result = cloneYaml(data)
        let current: any = result
        
        for (let i = 0; i < keys.length - 1; i++) {
            const key = keys[i]
            if (!key) continue
            
            if (!(key in current)) {
                // Create intermediate object or array
                const nextKey = keys[i + 1]
                if (nextKey) {
                    current[key] = /^\d+$/.test(nextKey) ? [] : {}
                }
            }
            current = current[key]
        }
        
        const lastKey = keys[keys.length - 1]
        if (lastKey) {
            current[lastKey] = value
        }
        return result
    }

    /**
     * Check if data is empty
     */
    function isEmpty(data: YamlFormData): boolean {
        if (!data) return true
        return Object.keys(data).length === 0
    }

    /**
     * Get all keys (flattened paths)
     */
    function getAllKeys(data: YamlFormData, prefix = ''): string[] {
        const keys: string[] = []
        
        for (const key in data) {
            const fullKey = prefix ? `${prefix}.${key}` : key
            keys.push(fullKey)
            
            const value = data[key]
            if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
                keys.push(...getAllKeys(value as YamlFormData, fullKey))
            }
        }
        
        return keys
    }

    /**
     * Diff two YAML objects
     */
    function diffYaml(oldData: YamlFormData, newData: YamlFormData): {
        added: string[]
        removed: string[]
        modified: string[]
    } {
        const oldKeys = getAllKeys(oldData)
        const newKeys = getAllKeys(newData)
        
        const added = newKeys.filter(key => !oldKeys.includes(key))
        const removed = oldKeys.filter(key => !newKeys.includes(key))
        const modified = newKeys.filter(key => {
            if (added.includes(key)) return false
            const oldValue = getValueAtPath(oldData, key)
            const newValue = getValueAtPath(newData, key)
            return JSON.stringify(oldValue) !== JSON.stringify(newValue)
        })
        
        return { added, removed, modified }
    }

    return {
        parseYaml,
        stringifyYaml,
        validateYaml,
        cloneYaml,
        mergeYaml,
        getValueAtPath,
        setValueAtPath,
        isEmpty,
        getAllKeys,
        diffYaml,
    }
}
